/* Рисует горизонтальный график сроков из tasks.list (SVG строится через DOM — без inline-скриптов и внешних ресурсов). */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var DAY = 86400000;
  var ROW = 26, LABEL = 220, PAD = 20;

  function el(name, attrs, text) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  var t = function (s) { return new Date(s + 'T00:00:00Z').getTime(); };

  function render(tasks, statuses) {
    var box = document.getElementById('chart');
    box.textContent = '';
    var dated = tasks.filter(function (x) { return x.start_date && x.end_date; });
    if (!dated.length) { box.textContent = 'Нет задач со сроками'; return; }
    var min = Math.min.apply(null, dated.map(function (x) { return t(x.start_date); }));
    var max = Math.max.apply(null, dated.map(function (x) { return t(x.end_date); }));
    var days = Math.max(1, Math.round((max - min) / DAY) + 1);
    var W = Math.max(640, LABEL + days * 14 + PAD);
    var H = 30 + dated.length * ROW + PAD;
    var scale = (W - LABEL - PAD) / days;
    var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H });

    for (var d = 0; d <= days; d += Math.max(1, Math.round(days / 12))) {
      var x = LABEL + d * scale;
      svg.appendChild(el('line', { x1: x, x2: x, y1: 20, y2: H - PAD, class: 'grid' }));
      svg.appendChild(el('text', { x: x + 2, y: 14 }, new Date(min + d * DAY).toISOString().slice(5, 10).split('-').reverse().join('.')));
    }
    dated.forEach(function (task, i) {
      var y = 30 + i * ROW;
      var done = task.status_id === 1;
      var x1 = LABEL + ((t(task.start_date) - min) / DAY) * scale;
      var w = Math.max(4, ((t(task.end_date) - t(task.start_date)) / DAY + 1) * scale);
      var indent = task.parent_id ? 12 : 0;
      svg.appendChild(el('text', { x: 6 + indent, y: y + 14 }, task.title.length > 28 ? task.title.slice(0, 27) + '…' : task.title));
      var bar = el('rect', { x: x1, y: y + 3, width: w, height: ROW - 10, rx: 2, class: done ? 'bar-done' : task.type === 'TODO' ? 'bar-todo' : 'bar-roadmap' });
      bar.appendChild(el('title', {}, task.title + ': ' + task.start_date + ' — ' + task.end_date));
      svg.appendChild(bar);
    });
    box.appendChild(svg);
  }

  vector.ready(function () {
    vector.tasks.list().then(render).catch(function (e) {
      var box = document.getElementById('chart');
      box.textContent = '';
      var s = document.createElement('span');
      s.className = 'err';
      s.textContent = 'Не удалось получить задачи: ' + e.message;
      box.appendChild(s);
    });
  });
})();
