/* Панель «Зависимости» в окне задачи/карточки:
   сверху — итог (можно начинать или нет), затем «Ждёт завершения», «Блокирует» и поиск для добавления связи. */
(function () {
  var out = document.getElementById('out');
  var h = Deps.h;
  var taskId = null;
  var errorText = '';
  var query = '';
  var focusSearch = false;

  function change(fn) {
    Deps.load().then(function (state) {
      return Deps.save(taskId, fn(Deps.blockers(state, taskId).slice()));
    }).then(function () { errorText = ''; query = ''; render(); }).catch(function (e) { errorText = e.message; render(); });
  }

  function item(state, id, removable) {
    var t = state.tasks[id];
    var r = h('div', 'item' + (Deps.isOpen(state, id) ? ' open' : ' done'));
    r.appendChild(h('span', 'item-title', t.title));
    r.appendChild(Deps.badge(t));
    if (removable) {
      var x = h('button', 'x', '×');
      x.type = 'button';
      x.title = 'Убрать зависимость';
      x.setAttribute('aria-label', 'Убрать зависимость: ' + t.title);
      x.onclick = function () { change(function (list) { return list.filter(function (b) { return b !== id; }); }); };
      r.appendChild(x);
    }
    return r;
  }

  function section(title, count) {
    var s = h('section', 'sec');
    var head = h('div', 'sec-head');
    head.appendChild(h('span', null, title));
    if (count != null) head.appendChild(h('b', null, String(count)));
    s.appendChild(head);
    return s;
  }

  function render() {
    Deps.load().then(function (state) {
      out.textContent = '';
      if (!state.tasks[taskId]) { out.appendChild(h('div', 'muted', 'Задача не найдена')); return; }
      var mine = Deps.blockers(state, taskId);
      var waiting = mine.filter(function (b) { return Deps.isOpen(state, b); }).length;
      var after = Deps.blocking(state, taskId);

      /* Итог */
      var sum = h('div', 'sum ' + (waiting ? 'bad' : 'ok'));
      if (!mine.length) { sum.className = 'sum none'; sum.textContent = 'Зависимостей нет — задачу можно начинать'; }
      else if (waiting) sum.textContent = 'Заблокирована: ждёт ' + waiting + ' из ' + mine.length;
      else sum.textContent = 'Можно начинать: всё завершено';
      out.appendChild(sum);

      /* Ждёт завершения */
      if (mine.length) {
        var s1 = section('Ждёт завершения', mine.length);
        mine.forEach(function (b) { s1.appendChild(item(state, b, true)); });
        out.appendChild(s1);
      }
      /* Блокирует */
      if (after.length) {
        var s2 = section('Блокирует', after.length);
        after.forEach(function (id) { s2.appendChild(item(state, id, false)); });
        out.appendChild(s2);
      }

      /* Добавление: поиск по названию */
      var s3 = section('Добавить зависимость');
      var input = h('input', 'search');
      input.type = 'search';
      input.placeholder = 'Начните вводить название задачи…';
      input.value = query;
      s3.appendChild(input);
      var candidates = Object.keys(state.tasks).map(function (k) { return state.tasks[k]; })
        .filter(function (t) { return t.id !== taskId && mine.indexOf(t.id) === -1 && !Deps.reaches(state, t.id, taskId); });
      var list = h('div', 'pick');
      function fill() {
        list.textContent = '';
        var q = query.trim().toLowerCase();
        var shown = candidates.filter(function (t) { return !q || t.title.toLowerCase().indexOf(q) !== -1; }).slice(0, 6);
        if (!shown.length) { list.appendChild(h('div', 'muted pick-empty', candidates.length ? 'Ничего не найдено' : 'Нет подходящих задач')); return; }
        shown.forEach(function (t) {
          var b = h('button', 'pick-item');
          b.type = 'button';
          b.appendChild(h('span', 'item-title', t.title));
          b.appendChild(Deps.badge(t));
          b.appendChild(h('span', 'plus', '+'));
          b.onclick = function () { change(function (l) { l.push(t.id); return l; }); };
          list.appendChild(b);
        });
      }
      input.oninput = function () { query = input.value; fill(); };
      s3.appendChild(list);
      fill();
      out.appendChild(s3);
      if (focusSearch) { input.focus(); focusSearch = false; }
      if (errorText) out.appendChild(h('div', 'err', errorText));
    }).catch(function (e) { out.textContent = ''; out.appendChild(h('div', 'err', 'Ошибка: ' + e.message)); });
  }

  vector.ready(function (ctx) { taskId = ctx.taskId; vector.ui.autoResize(); render(); });
})();
