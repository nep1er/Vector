/* Общая логика: хранение связей в собственной коллекции расширения «deps» (ключ — id задачи, значение — {blockedBy:[id,...]}). */
(function () {
  var DONE = 1;
  var COLLECTION = 'deps';

  function load() {
    return Promise.all([vector.tasks.list(), vector.data.list(COLLECTION)]).then(function (r) {
      var tasks = {};
      r[0].forEach(function (t) { tasks[t.id] = t; });
      var deps = {};
      r[1].forEach(function (row) {
        var list = (row.value && row.value.blockedBy) || [];
        deps[row.key] = list.filter(function (id) { return tasks[id]; }); // связи с удалёнными/скрытыми задачами игнорируем
      });
      return { tasks: tasks, deps: deps };
    });
  }

  function blockers(state, id) { return state.deps[String(id)] || []; }

  function blocking(state, id) {
    return Object.keys(state.deps).filter(function (k) { return state.deps[k].indexOf(id) !== -1; }).map(Number);
  }

  /** Достижима ли задача target из from по цепочке «предшественников» (для запрета циклов) */
  function reaches(state, from, target, seen) {
    seen = seen || {};
    if (from === target) return true;
    if (seen[from]) return false;
    seen[from] = true;
    return blockers(state, from).some(function (b) { return reaches(state, b, target, seen); });
  }

  function save(taskId, list) {
    if (list.length === 0) return vector.data.remove(COLLECTION, String(taskId));
    return vector.data.set(COLLECTION, String(taskId), { blockedBy: list });
  }

  /** Названия и цвета статусов (id совпадают с таблицей task_status) */
  var STATUS = {
    1: ['Выполнено', '#2f9e5b'], 2: ['В процессе', '#d9a21b'], 3: ['В плане', '#4a8fd6'],
    4: ['Просрочено', '#e0483e'], 5: ['Заморожено', '#7fb7c9'], 6: ['Неактивно', '#8a8a8a']
  };
  function statusOf(task) { return STATUS[task.status_id] || ['—', '#8a8a8a']; }

  /** DOM-помощник: h('div', 'класс', 'текст') */
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /** Метка статуса: цветная точка + название */
  function badge(task) {
    var st = statusOf(task);
    var b = h('span', 'st');
    var dot = h('i'); dot.style.background = st[1];
    b.appendChild(dot); b.appendChild(document.createTextNode(st[0]));
    return b;
  }

  function isOpen(state, id) { return state.tasks[id] && state.tasks[id].status_id !== DONE; }

  window.Deps = { load: load, blockers: blockers, blocking: blocking, reaches: reaches, save: save, isOpen: isOpen, statusOf: statusOf, h: h, badge: badge, DONE: DONE };
})();
