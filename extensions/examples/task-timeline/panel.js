/* Панель в карточке задачи: сроки выбранной задачи и её вложенных задач. */
(function () {
  function row(name, value) {
    var r = document.createElement('div');
    r.className = 'panel-row';
    var a = document.createElement('span'); a.textContent = name;
    var b = document.createElement('b'); b.textContent = value;
    r.appendChild(a); r.appendChild(b);
    return r;
  }
  var fmt = function (s) { return s ? s.split('-').reverse().join('.') : '—'; };

  vector.ready(function (ctx) {
    vector.ui.autoResize();
    vector.tasks.list().then(function (tasks) {
      var out = document.getElementById('out');
      out.textContent = '';
      var me = tasks.filter(function (x) { return x.id === ctx.taskId; })[0];
      if (!me) { out.textContent = 'Задача не найдена'; return; }
      var kids = tasks.filter(function (x) { return x.parent_id === me.id; });
      var left = me.end_date ? Math.ceil((new Date(me.end_date + 'T23:59:59').getTime() - Date.now()) / 86400000) : null;
      out.appendChild(row('Начало', fmt(me.start_date)));
      out.appendChild(row('Окончание', fmt(me.end_date)));
      out.appendChild(row('Осталось дней', left == null ? '—' : String(left)));
      out.appendChild(row('Вложенных задач', String(kids.length)));
      
    }).catch(function (e) {
      document.getElementById('out').textContent = 'Ошибка: ' + e.message;
    });
  });
})();
