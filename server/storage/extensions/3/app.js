/* Страница-обзор: показатели, поиск, фильтр и список «задача ← от чего зависит». */
(function () {
  var out = document.getElementById('out');
  var h = Deps.h;
  var filter = 'all'; // all | blocked | ready
  var query = '';
  var state = null;

  function rows() {
    return Object.keys(state.deps).map(Number)
      .filter(function (id) { return state.tasks[id] && state.deps[id].length; })
      .map(function (id) {
        var waiting = state.deps[id].filter(function (b) { return Deps.isOpen(state, b); });
        return { id: id, task: state.tasks[id], blockers: state.deps[id], waiting: waiting.length };
      });
  }

  function stat(label, value, cls) {
    var s = h('div', 'stat' + (cls ? ' ' + cls : ''));
    s.appendChild(h('b', null, String(value)));
    s.appendChild(h('span', null, label));
    return s;
  }

  function render() {
    out.textContent = '';
    var all = rows();
    var blocked = all.filter(function (r) { return r.waiting > 0; });
    var links = all.reduce(function (n, r) { return n + r.blockers.length; }, 0);

    var stats = h('div', 'stats');
    stats.appendChild(stat('связей', links));
    stats.appendChild(stat('задач заблокировано', blocked.length, blocked.length ? 'bad' : ''));
    stats.appendChild(stat('готовы к старту', all.length - blocked.length, 'ok'));
    out.appendChild(stats);

    if (!all.length) {
      out.appendChild(h('div', 'empty', 'Связей пока нет. Откройте задачу и добавьте зависимость в блоке «Зависимости».'));
      return;
    }

    var bar = h('div', 'bar');
    var search = h('input', 'search');
    search.type = 'search';
    search.placeholder = 'Поиск по названию…';
    search.value = query;
    search.oninput = function () { query = search.value; renderList(); };
    bar.appendChild(search);
    var seg = h('div', 'seg');
    [['all', 'Все'], ['blocked', 'Заблокированные'], ['ready', 'Готовы']].forEach(function (f) {
      var b = h('button', filter === f[0] ? 'on' : '', f[1]);
      b.type = 'button';
      b.onclick = function () { filter = f[0]; render(); };
      seg.appendChild(b);
    });
    bar.appendChild(seg);
    out.appendChild(bar);

    var list = h('div', 'rows');
    list.id = 'rows';
    out.appendChild(list);
    renderList();
  }

  function renderList() {
    var list = document.getElementById('rows');
    list.textContent = '';
    var q = query.trim().toLowerCase();
    var data = rows().filter(function (r) {
      if (filter === 'blocked' && !r.waiting) return false;
      if (filter === 'ready' && r.waiting) return false;
      if (!q) return true;
      return r.task.title.toLowerCase().indexOf(q) !== -1 ||
        r.blockers.some(function (b) { return state.tasks[b].title.toLowerCase().indexOf(q) !== -1; });
    }).sort(function (a, b) { return (b.waiting > 0) - (a.waiting > 0) || a.task.title.localeCompare(b.task.title, 'ru'); });
    if (!data.length) { list.appendChild(h('div', 'empty', 'Ничего не найдено')); return; }
    data.forEach(function (r) {
      var card = h('article', 'dep ' + (r.waiting ? 'blocked' : 'ready'));
      var left = h('div', 'dep-task');
      left.appendChild(h('div', 'dep-title', r.task.title));
      var meta = h('div', 'dep-meta');
      meta.appendChild(Deps.badge(r.task));
      meta.appendChild(h('span', 'flag ' + (r.waiting ? 'bad' : 'ok'), r.waiting ? 'Заблокирована' : 'Можно начинать'));
      left.appendChild(meta);
      card.appendChild(left);
      card.appendChild(h('div', 'arrow', '←'));
      var right = h('div', 'dep-blockers');
      right.appendChild(h('div', 'dep-label', 'Сначала завершить'));
      r.blockers.forEach(function (b) {
        var t = state.tasks[b];
        var line = h('div', 'blocker ' + (Deps.isOpen(state, b) ? 'open' : 'done'));
        line.appendChild(h('span', 'tick', Deps.isOpen(state, b) ? '○' : '✓'));
        line.appendChild(h('span', 'item-title', t.title));
        line.appendChild(Deps.badge(t));
        right.appendChild(line);
      });
      card.appendChild(right);
      list.appendChild(card);
    });
  }

  vector.ready(function () {
    Deps.load().then(function (s) { state = s; render(); })
      .catch(function (e) { out.textContent = ''; out.appendChild(h('div', 'err', 'Ошибка: ' + e.message)); });
  });
})();
