/*!
 * Vector Extension SDK v1
 * Кладётся в архив расширения рядом с HTML и подключается: <script src="vector-sdk.js"></script>
 * Расширение работает в песочнице (iframe sandbox), прямого доступа к сети и данным у него нет:
 * всё общение с Vector идёт через этот мост, а права выдаёт администратор проекта.
 */
(function () {
  'use strict';
  var pending = {};
  var seq = 0;
  var ctx = null;
  var readyCbs = [];
  var themeCbs = [];

  /* Цвета приложения приходят от Vector и доступны как CSS-переменные --v-bg, --v-surface, --v-surface2, --v-text,
     --v-muted, --v-border, --v-accent, --v-on-accent, --v-danger, --v-success, --v-input, --v-radius, --v-font:
     расширение автоматически совпадает с любой темой приложения. */
  function applyTheme(t, colors) {
    var root = document.documentElement;
    root.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    root.style.colorScheme = t === 'dark' ? 'dark' : 'light';
    if (colors) for (var k in colors) root.style.setProperty('--v-' + k, colors[k]);
    themeCbs.forEach(function (cb) { cb(t); });
  }

  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.vector !== 1 || e.source !== window.parent) return;
    if (m.event === 'ready') {
      ctx = m.context;
      applyTheme(ctx.theme, ctx.colors);
      readyCbs.splice(0).forEach(function (cb) { cb(ctx); });
    } else if (m.event === 'theme') {
      if (ctx) ctx.theme = m.theme;
      applyTheme(m.theme, m.colors);
    } else if (m.id != null && pending[m.id]) {
      var p = pending[m.id];
      delete pending[m.id];
      clearTimeout(p.timer);
      if (m.ok) p.resolve(m.result);
      else {
        var err = new Error((m.error && m.error.message) || 'Ошибка');
        err.code = m.error && m.error.code;
        p.reject(err);
      }
    }
  });

  function call(method, params) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      var timer = setTimeout(function () {
        delete pending[id];
        reject(new Error('Нет ответа от Vector (' + method + ')'));
      }, 15000);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      window.parent.postMessage({ vector: 1, id: id, method: method, params: params || {} }, '*');
    });
  }

  window.vector = {
    /** Выполнить cb(context), когда мост готов. context: {projectId, viewId, user, theme, permissions, taskId?, demo} */
    ready: function (cb) { if (ctx) cb(ctx); else readyCbs.push(cb); },
    onTheme: function (cb) { themeCbs.push(cb); },
    call: call,
    tasks: {
      list: function () { return call('tasks.list'); },
      statuses: function () { return call('tasks.statuses'); },
      updateDates: function (id, startDate, endDate) { return call('tasks.updateDates', { id: id, startDate: startDate, endDate: endDate }); },
      setStatus: function (id, statusId) { return call('tasks.setStatus', { id: id, statusId: statusId }); }
    },
    kanban: {
      board: function (todoId) { return call('kanban.board', { todoId: todoId }); },
      moveCard: function (cardId, columnId, index) { return call('kanban.moveCard', { cardId: cardId, columnId: columnId, index: index }); }
    },
    /** Собственное хранилище расширения в проекте (права data:read / data:write; запись — только руководителям) */
    data: {
      list: function (collection) { return call('data.list', { collection: collection }); },
      set: function (collection, key, value) { return call('data.set', { collection: collection, key: key, value: value }); },
      remove: function (collection, key) { return call('data.remove', { collection: collection, key: key }); }
    },
    members: { list: function () { return call('members.list'); } },
    storage: { list: function () { return call('storage.list'); } },
    ui: {
      resize: function (height) { return call('ui.resize', { height: height }); },
      /** Панель в задаче: сама подстраивает высоту под содержимое (body должен быть без внешних отступов) */
      autoResize: function () {
        if (window.__vectorAuto || !window.ResizeObserver) return;
        window.__vectorAuto = true;
        var last = 0;
        new ResizeObserver(function () {
          var h = Math.ceil(document.body.getBoundingClientRect().height);
          if (Math.abs(h - last) > 1) { last = h; call('ui.resize', { height: h }).catch(function () {}); }
        }).observe(document.body);
      }
    }
  };

  window.parent.postMessage({ vector: 1, event: 'hello' }, '*');
})();
