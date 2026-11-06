/* Панель «Зависимости» в окне задачи: предшественники (блокируют эту задачу), мини-дерево связей и добавление. */
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

  function node(state, id, removable) {
    var t = state.tasks[id];
    var li = h('li');
    var row = h('div', 'node');
    row.appendChild(h('span', t.status_id === Deps.DONE ? 'dot done' : 'dot todo'));
    row.appendChild(h('span', 't', t.title));
    if (removable) {
      var x = h('button', 'x', '✕');
      x.title = 'Убрать связь';
      x.onclick = function () { change(function (list) { return list.filter(function (b) { return b !== id; }); }); };
      row.appendChild(x);
    }
    li.appendChild(row);
    return li;
  }

  /** Мини-дерево: предшественники предшественников (до 3 уровней) */
  function tree(state, id, depth, seen) {
    var ul = h('ul', 'tree');
    Deps.blockers(state, id).forEach(function (b) {
      var li = node(state, b, depth === 0);
      if (depth < 2 && !seen[b]) {
        var sub = tree(state, b, depth + 1, Object.assign({}, seen, (function () { var o = {}; o[b] = 1; return o; })()));
        if (sub.children.length) li.appendChild(sub);
      }
      ul.appendChild(li);
    });
    return ul;
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

      out.appendChild(h('h2', null, 'Сначала нужно завершить'));
      if (mine.length) {
        out.appendChild(tree(state, taskId, 0, (function () { var o = {}; o[taskId] = 1; return o; })()));
        var open = mine.filter(function (b) { return Deps.isOpen(state, b); }).length;
        out.appendChild(h('div', open ? 'err' : 'muted', open ? 'Не завершено: ' + open + '. Начать и завершить задачу нельзя.' : 'Все предшественники выполнены.'));
      } else {
        out.appendChild(h('div', 'muted', 'Нет блокирующих задач'));
      }

      var after = Deps.blocking(state, taskId);
      if (after.length) {
        out.appendChild(h('h2', null, 'Эта задача блокирует'));
        var ul = h('ul', 'tree');
        after.forEach(function (id) { ul.appendChild(node(state, id, false)); });
        out.appendChild(ul);
      }

      var add = h('div', 'add');
      var sel = h('select');
      sel.appendChild(new Option('Добавить блокирующую задачу…', ''));
      Object.keys(state.tasks).map(function (k) { return state.tasks[k]; })
        .filter(function (t) { return t.id !== taskId && mine.indexOf(t.id) === -1 && !Deps.reaches(state, t.id, taskId) ; })
        .forEach(function (t) { sel.appendChild(new Option((t.type === 'TODO' ? '· ' : '') + t.title, String(t.id))); });
      var btn = h('button', 'primary', 'Добавить');
      btn.onclick = function () {
        var id = Number(sel.value);
        if (!id) return;
        change(function (list) { list.push(id); return list; });
      };
      add.appendChild(sel); add.appendChild(btn);
      out.appendChild(add);
      if (errorText) out.appendChild(h('div', 'err', errorText));
      vector.ui.resize(out.scrollHeight + 18);
    }).catch(function (e) { out.textContent = 'Ошибка: ' + e.message; });
  }

  vector.ready(function (ctx) { taskId = ctx.taskId; render(); });
})();
