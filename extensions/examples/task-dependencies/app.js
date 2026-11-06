/* Страница-обзор: все задачи, у которых есть предшественники, и признак «заблокирована». */
(function () {
  var out = document.getElementById('out');
  function h(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  vector.ready(function () {
    Deps.load().then(function (state) {
      out.textContent = '';
      var ids = Object.keys(state.deps).map(Number).filter(function (id) { return state.tasks[id] && state.deps[id].length; });
      if (!ids.length) { out.appendChild(h('div', 'muted', 'Связей пока нет. Откройте задачу и добавьте блокирующую во вкладке «Зависимости».')); return; }
      var table = h('table');
      var head = h('tr');
      ['Задача', 'Ждёт завершения', 'Состояние'].forEach(function (c) { head.appendChild(h('th', null, c)); });
      table.appendChild(head);
      ids.forEach(function (id) {
        var tr = h('tr');
        tr.appendChild(h('td', null, state.tasks[id].title));
        var td = h('td');
        state.deps[id].forEach(function (b) {
          var line = h('div');
          line.appendChild(h('span', Deps.isOpen(state, b) ? 'dot todo' : 'dot done'));
          line.appendChild(document.createTextNode(' ' + state.tasks[b].title));
          td.appendChild(line);
        });
        tr.appendChild(td);
        var blocked = state.deps[id].some(function (b) { return Deps.isOpen(state, b); });
        var st = h('td');
        st.appendChild(h('span', blocked ? 'badge blocked' : 'badge', blocked ? 'заблокирована' : 'можно начинать'));
        tr.appendChild(st);
        table.appendChild(tr);
      });
      out.appendChild(table);
    }).catch(function (e) { out.textContent = ''; out.appendChild(h('div', 'err', 'Ошибка: ' + e.message)); });
  });
})();
