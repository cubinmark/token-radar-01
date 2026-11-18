// Launch Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a live-token view and the model itself, with a filterable, sortable table and a
// per-protocol detail drawer. No network: every byte it shows is in data.js, and every farm plan it
// shows is the very string board.json carries for that protocol.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', scope: 'all', tab: 'board', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n === null || n === undefined ? 'n/a' : n.toFixed(2) + 'x'; }

  // The model in one function, the same arithmetic lib/model.ts runs: the page recomputes a row
  // from the snapshot figures and checks the number board.json carries, so the code and the board
  // are visibly one model, not two.
  function impliedOf(row) {
    var m = DATA.model;
    var growthRaw = row.change_7d === null || row.change_7d === undefined ? 0 : Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d));
    var growth = 1 + (growthRaw / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var ageF = m.age_floor + (Math.min(Math.max(age, 0), m.age_days_cap) / m.age_days_cap) * m.age_range;
    var chainF = 1 + m.chain_step * Math.min(Math.max((row.chains || []).length - 1, 0), m.chain_max_extra);
    var raw = row.tvl_usd * row.category_multiple * growth * ageF * chainF * m.launch_discount;
    return Math.max(1, Math.min(Math.round(raw), row.tvl_usd * 4));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('scope')) state.scope = params.get('scope');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.scope !== 'all') params.set('scope', state.scope);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.scope === 'watchlist' && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.category_multiple; bv = b.category_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'brand-name' }, 'LAUNCH ', el('b', { text: 'RADAR' })),
        el('span', { class: 'sub', text: 'token launch radar' })
      ),
      el('div', { class: 'top-meta' },
        el('span', { text: 'snapshot ' + DATA.as_of }),
        el('span', { text: DATA.scanned_size + ' protocols scanned' }),
        el('span', { text: 'model ' + DATA.model_version })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' protocols with no token on record, ranked by what a token would be worth' }),
        el('p', null,
          'Implied value is this board\u2019s own claim: what a token would be worth ',
          el('b', { text: 'if the protocol issued one and its record stayed as it is' }),
          '. It is built from the trading multiples of protocols that already have tokens, category by category. It does not predict whether or when a token comes, and a protocol that ',
          el('b', { text: 'records no token' }),
          ' may still have one its record does not carry.'
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the $50M floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live tokens shown apart' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Market median mcap / TVL' }), el('b', { text: fmtMult(DATA.global_median) }))
      )
    );
  }

  function seg(options, current, onPick, label) {
    return el('div', { class: 'field' },
      el('span', { class: 'lab', text: label }),
      el('div', { class: 'seg' }, options.map(function (o) {
        return el('button', { type: 'button', 'aria-pressed': current === o.value ? 'true' : 'false', text: o.text, onclick: function () { onPick(o.value); } });
      }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a] || (a < b ? -1 : 1); });
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    return el('div', { class: 'controls' },
      seg([
        { value: 'board', text: 'Board' },
        { value: 'live', text: 'Live tokens' },
        { value: 'model', text: 'The model' }
      ], state.tab, function (v) { state.tab = v; writeHash(); render(); }, 'View'),
      state.tab === 'board' ? seg([
        { value: 'all', text: 'All pre-token' },
        { value: 'watchlist', text: 'Watchlist only' }
      ], state.scope, function (v) { state.scope = v; writeHash(); render(); }, 'Scope') : null,
      state.tab === 'board' ? el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search) : null,
      state.tab === 'board' ? el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect) : null,
      state.tab === 'board' ? el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect) : null,
      el('span', { class: 'count', text: state.tab === 'board' ? rows().length + ' of ' + DATA.board_size + ' rows' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : DATA.multiples.length + ' category multiples' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.scope = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'chain unlisted') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.category_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, r.watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : el('span', { class: 'badge dim', text: 'EARLY' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols by implied value. Rank is the model\u2019s claim, not the sort: select a row for its working and its farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Mult'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Radar' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'chain unlisted') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.ratio === null ? 'n/a' : fmtMult(r.ratio) }),
        el('td', null, el('span', { class: 'badge dim', text: 'ALREADY TRADES' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'These protocols already have tokens: their market caps are facts, not model output, and their mcap/TVL ratios are the comparables the board\u2019s multiples are built from. They are never ranked with the pre-token board.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var tbody = el('tbody');
    DATA.multiples.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', { text: c.category || 'Uncategorised' }),
        el('td', { class: 'num', text: String(c.peers) }),
        el('td', { class: 'num', text: fmtMult(c.median) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) })
      ));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', null,
        'Start from the protocols that already trade. For each one the snapshot gives a market cap and a TVL, so each has a ',
        el('b', { text: 'realised multiple' }),
        ': mcap / TVL. A pre-token protocol inherits its category\u2019s median realised multiple, ',
        el('b', { text: 'shrunk toward the market median' }),
        ' by how many peers stand behind it (weight ' + m.shrinkage_k + '), and clamped to [' + m.multiple_min + 'x, ' + m.multiple_max + 'x] so one wild peer cannot carry a category.'
      ),
      el('div', { class: 'formula', text: 'implied = TVL x category multiple x growth x age x reach x ' + m.launch_discount + ' (launch discount)' }),
      el('p', null,
        el('b', { text: 'Growth' }),
        ' is 1 + clamp(7d change, ' + m.growth_floor + '%, +' + m.growth_cap + '%) x ' + m.growth_weight + '. ',
        el('b', { text: 'Age' }),
        ' runs from ' + m.age_floor + ' to ' + (m.age_floor + m.age_range) + ' over ' + m.age_days_cap + ' days with no token: a longer record is a more proven product. ',
        el('b', { text: 'Reach' }),
        ' adds ' + (m.chain_step * 100) + '% per extra chain, up to five. The ',
        el('b', { text: 'launch discount' }),
        ' says a token that does not exist yet prices below the established-peer median even if everything else holds.'
      ),
      el('p', { text: 'Every factor of every row is in board.json and in the row\u2019s detail view, with the category\u2019s trading peers beside it. The page recomputes each row from these figures and shows the check in the detail view. No protocol name is special-cased anywhere in the model.' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Category multiples derived from this snapshot: peers are tokened protocols with a market cap and a TVL.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Peers' }), el('th', { scope: 'col', text: 'Median mcap/TVL' }), el('th', { scope: 'col', text: 'Multiple used' }))),
          tbody
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var check = impliedOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' \u00b7 on the house watchlist' : ' \u00b7 early radar, below the watchlist floor') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' \u00b7 ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'chain unlisted') }),
        el('div', { class: 'big', text: fmtUsd(row.implied_value_usd) }),
        el('p', { class: 'sub', text: 'implied value if it issued a token and its record held' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'The working' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'market') + ')' }), el('b', { text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: 'Growth factor (7d ' + fmtPct(row.change_7d) + ')' }), el('b', { text: 'x' + row.growth_factor.toFixed(2) })),
        el('div', null, el('span', { text: 'Age factor (' + fmtAge(row.age_days) + ' with no token)' }), el('b', { text: 'x' + row.age_factor.toFixed(2) })),
        el('div', null, el('span', { text: 'Reach factor (' + (row.chains || []).length + ' chains)' }), el('b', { text: 'x' + row.chain_factor.toFixed(2) })),
        el('div', null, el('span', { text: 'Launch discount' }), el('b', { text: 'x' + DATA.model.launch_discount })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'This page recomputes the row as ' + fmtUsd(check) + (check === row.implied_value_usd ? ' \u2014 the same number board.json carries.' : ' \u2014 which differs from board.json, so the data would be stale.') })
    ));
    var peersSection = el('section', { class: 'detail-section' }, el('h3', { text: 'Trading peers in ' + (row.category || 'its category') }));
    if (row.peers && row.peers.length) {
      var peers = el('div', { class: 'peers' });
      row.peers.forEach(function (p) {
        peers.appendChild(el('div', null, el('b', { text: p.name }), el('span', { text: 'mcap ' + fmtUsd(p.mcap_usd) + ' \u00b7 TVL ' + fmtUsd(p.tvl_usd) + ' \u00b7 ' + fmtMult(p.ratio) })));
      });
      peersSection.appendChild(peers);
      peersSection.appendChild(el('p', { class: 'sub', text: 'The multiple above is this category\u2019s median realised multiple, shrunk toward the market median of ' + fmtMult(DATA.global_median) + '.' }));
    } else {
      peersSection.appendChild(el('p', { class: 'sub', text: 'No protocol in this category trades with a market cap in the snapshot, so the row uses the market median multiple of ' + fmtMult(DATA.global_median) + ', shrunk and clamped like every other.' }));
    }
    dialog.appendChild(peersSection);
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), tail ? el('span', { class: 'cost', text: tail }) : null);
      })),
      el('p', { class: 'sub', text: 'Farming is positioning, not a promise: a protocol may never issue a token, and nothing here is financial advice.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'board') shell.appendChild(boardTable());
    else if (state.tab === 'live') shell.appendChild(liveTable());
    else shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'foot' },
      el('span', { text: 'Data: ' + DATA.source + '. The snapshot is sealed: every run of this program reads the same bytes.' }),
      el('span', { text: 'Implied values are this board\u2019s model output (model ' + DATA.model_version + '), not prices, predictions or advice.' })
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
