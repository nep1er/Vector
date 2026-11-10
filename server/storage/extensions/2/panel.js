/* Панель «Зависимости» в окне задачи: что нужно завершить сначала, что блокирует эта задача, добавление связи. */
(function () {
  var out = document.getElementById('out');
  var taskId = null;
  var errorText = '';

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function row(state, id, opts) {
    var t = state.tasks[id];
    var done = t.status_id === Deps.DONE;
    var r = h('div', opts.child ? 'row child' : 'row');
    r.appendChild(h('span', 'title', t.title));
    r.appendChild(h('span', done ? 'chip ok' : 'chip wait', done ? 'выполнено' : 'не завершена'));
    if (opts.remove) {
      var x = h('button', 'icon-btn', '✕');
      x.title = 'Убрать связь';
      x.onclick = function () { change(function (list) { return list.filter(function (b) { return b !== id; }); }); };
      r.appendChild(x);
    }
    return r;
  }

  /** Вложенные предшественники (мини-дерево), до 2 уровней */
  function addChildren(state, list, id, depth, seen) {
    if (depth > 2) return;
    Deps.blockers(state, id).forEach(function (b) {
      if (seen[b]) return;
      list.appendChild(row(state, b, { child: true }));
      var next = {}; for (var k in seen) next[k] = 1; next[b] = 1;
      addChildren(state, list, b, depth + 1, next);
    });
  }

  function change(fn) {
    Deps.load().then(function (state) {
      return Deps.save(taskId, fn(Deps.blockers(state, taskId).slice()));
    }).then(function () { errorText = ''; render(); }).catch(function (e) { errorText = e.message; render(); });
  }

  function render() {
    Deps.load().then(function (state) {
      out.textContent = '';
      var me = state.tasks[taskId];
      if (!me) { out.textContent = 'Задача не найдена'; return; }
      var mine = Deps.blockers(state, taskId);
      var open = mine.filter(function (b) { return Deps.isOpen(state, b); }).length;

      if (mine.length) {
        out.appendChild(h('div', open ? 'banner blocked' : 'banner free', open ? '⛔ Заблокирована: не завершено ' + open : '✓ Можно начинать: всё выполнено'));
        var g = h('div', 'group');
        g.appendChild(h('div', 'group-title', 'Сначала нужно завершить'));
        var list = h('div', 'list');
        mine.forEach(function (b) {
          list.appendChild(row(state, b, { remove: true }));
          addChildren(state, list, b, 1, (function () { var o = {}; o[taskId] = 1; o[b] = 1; return o; })());
        });
        g.appendChild(list);
        out.appendChild(g);
      }

      var after = Deps.blocking(state, taskId);
      if (after.length) {
        var g2 = h('div', 'group');
        g2.appendChild(h('div', 'group-title', 'Эта задача блокирует'));
        var l2 = h('div', 'list');
        after.forEach(function (id) { l2.appendChild(row(state, id, {})); });
        g2.appendChild(l2);
        out.appendChild(g2);
      }

      var add = h('div', 'add');
      var sel = h('select');
      sel.appendChild(new Option('Выберите блокирующую задачу…', ''));
      Object.keys(state.tasks).map(function (k) { return state.tasks[k]; })
        .filter(function (t) { return t.id !== taskId && mine.indexOf(t.id) === -1 && !Deps.reaches(state, t.id, taskId); })
        .forEach(function (t) { sel.appendChild(new Option(t.title, String(t.id))); });
      var btn = h('button', 'primary', 'Добавить');
      btn.onclick = function () {
        var id = Number(sel.value);
        if (!id) return;
        change(function (list) { list.push(id); return list; });
      };
      add.appendChild(sel); add.appendChild(btn);
      out.appendChild(add);
      if (errorText) out.appendChild(h('div', 'err', errorText));
    }).catch(function (e) { out.textContent = 'Ошибка: ' + e.message; });
  }

  vector.ready(function (ctx) { taskId = ctx.taskId; vector.ui.autoResize(); render(); });
})();
