using System.Globalization;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;

namespace Vector.Desktop.Controls;

/// <summary>Нативный WPF-перенос Web Timeline: дорожки, календарная сетка, масштаб и изменение сроков мышью.</summary>
internal sealed class RoadmapTimeline : UserControl
{
    private const double LaneHeight = 56, LaneGap = 8, RulerHeight = 56;
    private static readonly int[] Zooms = [4, 7, 12, 20, 32, 48, 72];
    private const int DefaultZoom = 48;
    private readonly JsonElement[] _tasks;
    private readonly bool _canEdit;
    private int? _selectedId;
    private readonly Func<JsonElement, string, string, Task> _changeDates;
    private readonly Action<JsonElement?> _select;
    private readonly Action<JsonElement> _open;
    private readonly string? _rangeStart, _rangeEnd;
    private readonly ScrollViewer _scroll;
    private readonly Canvas _canvas;
    private readonly TextBlock _error;
    private readonly StackPanel _undated;
    private int _zoom = DefaultZoom;
    private int _startDay, _endDay;
    private double _pixelsPerDay = DefaultZoom;
    private DragSession? _drag;
    private readonly List<(JsonElement Task, int Start, int End, int Lane)> _placed = [];

    private sealed class DragSession
    {
        public required Grid Bar { get; init; }
        public required JsonElement Task { get; init; }
        public required int Start { get; init; }
        public required int End { get; init; }
        public required string Mode { get; init; }
        public required double StartX { get; init; }
        public required double StartScroll { get; init; }
        public int DeltaStart { get; set; }
        public int DeltaEnd { get; set; }
        public bool Moved { get; set; }
    }

    internal RoadmapTimeline(
        IEnumerable<JsonElement> tasks,
        string? rangeStart,
        string? rangeEnd,
        int? selectedId,
        bool canEdit,
        Func<JsonElement, string, string, Task> changeDates,
        Action<JsonElement?> select,
        Action<JsonElement> open)
    {
        _tasks = tasks.ToArray();
        _rangeStart = rangeStart;
        _rangeEnd = rangeEnd;
        _selectedId = selectedId;
        _canEdit = canEdit;
        _changeDates = changeDates;
        _select = select;
        _open = open;

        _canvas = new Canvas { Background = Brushes.Transparent };
        _scroll = new ScrollViewer
        {
            Content = _canvas,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            MinHeight = 250,
            Height = 340,
            Background = Brushes.Transparent,
            CanContentScroll = false
        };
        _error = new TextBlock { Margin = new Thickness(12, 6, 12, 6), Visibility = Visibility.Collapsed, TextWrapping = TextWrapping.Wrap };
        _error.SetResourceReference(TextBlock.ForegroundProperty, "Brush.Danger");
        _undated = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(10, 8, 10, 8) };
        var frame = new Border { CornerRadius = new CornerRadius(8), BorderThickness = new Thickness(1), ClipToBounds = true };
        frame.SetResourceReference(Border.BackgroundProperty, "Brush.TimelineBg");
        frame.SetResourceReference(Border.BorderBrushProperty, "Brush.SidebarBorder");
        frame.Child = BuildLayout();
        Content = frame;
        Draw();
        _scroll.SizeChanged += (_, _) => { if (IsLoaded) Draw(); };
        _canvas.MouseLeftButtonDown += (_, e) =>
        {
            if (ReferenceEquals(e.OriginalSource, _canvas))
            {
                _selectedId = null;
                UpdateSelectionVisuals();
                _select(null);
            }
        };
        Loaded += (_, _) => { Draw(); ScrollToToday(); };
    }

    private UIElement BuildLayout()
    {
        var root = new DockPanel();
        var toolbar = new DockPanel { LastChildFill = false, Margin = new Thickness(10, 8, 10, 8) };
        var legend = new WrapPanel { VerticalAlignment = VerticalAlignment.Center };
        foreach (var status in Statuses)
        {
            var item = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 12, 0) };
            item.Children.Add(new Border { Width = 9, Height = 9, CornerRadius = new CornerRadius(5), Background = Paint(status.Color), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 5, 0) });
            var label = new TextBlock { Text = status.Name, FontSize = 12, VerticalAlignment = VerticalAlignment.Center };
            label.SetResourceReference(TextBlock.ForegroundProperty, "Brush.SidebarText");
            item.Children.Add(label);
            legend.Children.Add(item);
        }
        DockPanel.SetDock(legend, Dock.Left);
        toolbar.Children.Add(legend);

        var actions = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        actions.Children.Add(TimelineButton("Сегодня", ScrollToToday));
        actions.Children.Add(TimelineButton("−", () => ChangeZoom(-1), 34));
        actions.Children.Add(TimelineButton("+", () => ChangeZoom(1), 34));
        DockPanel.SetDock(actions, Dock.Right);
        toolbar.Children.Add(actions);
        DockPanel.SetDock(toolbar, Dock.Top);
        root.Children.Add(toolbar);

        DockPanel.SetDock(_error, Dock.Bottom);
        root.Children.Add(_error);
        DockPanel.SetDock(_undated, Dock.Bottom);
        root.Children.Add(_undated);
        var separator = new Border { Height = 1 };
        separator.SetResourceReference(Border.BackgroundProperty, "Brush.TimelineGrid");
        DockPanel.SetDock(separator, Dock.Top);
        root.Children.Add(separator);
        root.Children.Add(_scroll);
        return root;
    }

    private Button TimelineButton(string text, Action action, double? width = null)
    {
        var button = new Button { Content = text, Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(4, 0, 0, 0), MinWidth = width ?? 68, Cursor = Cursors.Hand, FontSize = 13, Background = Brushes.Transparent };
        button.SetResourceReference(Control.ForegroundProperty, "Brush.SidebarText");
        button.SetResourceReference(Control.BorderBrushProperty, "Brush.TimelineGrid");
        button.Click += (_, _) => action();
        return button;
    }

    private static readonly (int Id, string Name, string Color)[] Statuses =
    [
        (1, "Выполнено", "#2F9E5B"),
        (2, "В процессе", "#D9A21B"),
        (3, "В плане", "#4A8FD6"),
        (4, "Просрочено", "#E0483E"),
        (5, "Заморожено", "#7FB7C9"),
        (6, "Неактивно", "#8A8A8A")
    ];

    private static string S(JsonElement e, string key) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(key, out var value) && value.ValueKind != JsonValueKind.Null ? value.ToString() : "";
    private static int N(JsonElement e, string key) => int.TryParse(S(e, key), out var value) ? value : 0;
    private static JsonElement P(JsonElement e, string key) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(key, out var value) ? value : default;
    private static IEnumerable<JsonElement> A(JsonElement e) =>
        e.ValueKind == JsonValueKind.Array ? e.EnumerateArray().ToArray() : Array.Empty<JsonElement>();
    private static Brush Paint(string hex) => new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
    private static string TextOn(string hex)
    {
        var c = (Color)ColorConverter.ConvertFromString(hex);
        static double Linear(byte b) { var v = b / 255d; return v <= .03928 ? v / 12.92 : Math.Pow((v + .055) / 1.055, 2.4); }
        var l = .2126 * Linear(c.R) + .7152 * Linear(c.G) + .0722 * Linear(c.B);
        return 1.05 / (l + .05) >= (l + .05) / .057 ? "#FFFFFF" : "#141414";
    }
    private static int DayIndex(string value)
    {
        if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date)) return 0;
        return (int)Math.Floor((date.UtcDateTime - DateTime.UnixEpoch).TotalDays);
    }
    private static int TodayIndex() => (int)(DateTime.Today - DateTime.UnixEpoch.Date).TotalDays;
    private static string ShiftIso(string value, int delta)
    {
        var date = DateTimeOffset.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal).ToUniversalTime().AddDays(delta);
        return date.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    }
    private static string FormatDay(int index) => DateTime.UnixEpoch.AddDays(index).ToString("d MMM", CultureInfo.GetCultureInfo("ru-RU"));
    private static int DayOfMonth(int index) => DateTime.UnixEpoch.AddDays(index).Day;
    private static string MonthLabel(int index)
    {
        var value = DateTime.UnixEpoch.AddDays(index).ToString("MMMM yyyy", CultureInfo.GetCultureInfo("ru-RU"));
        return char.ToUpper(value[0], CultureInfo.GetCultureInfo("ru-RU")) + value[1..];
    }
    private static int NextMonthStart(int index)
    {
        var date = DateTime.UnixEpoch.AddDays(index);
        var next = new DateTime(date.Year, date.Month, 1).AddMonths(1);
        return (int)(next - DateTime.UnixEpoch.Date).TotalDays;
    }

    private void ChangeZoom(int delta)
    {
        var index = Array.IndexOf(Zooms, _zoom);
        var next = Math.Clamp(index + delta, 0, Zooms.Length - 1);
        if (next == index) return;
        var anchor = TodayIndex();
        _zoom = Zooms[next];
        Draw();
        _scroll.ScrollToHorizontalOffset(Math.Max(0, (anchor - _startDay) * _pixelsPerDay - 120));
    }

    private void ScrollToToday()
    {
        var today = TodayIndex();
        var target = today >= _startDay && today <= _endDay ? (today - _startDay) * _pixelsPerDay :
            _placed.Count > 0 ? (_placed[0].Start - _startDay) * _pixelsPerDay : 0;
        _scroll.ScrollToHorizontalOffset(Math.Max(0, target - 120));
    }

    private void Draw()
    {
        var dated = _tasks.Where(t => !string.IsNullOrWhiteSpace(S(t, "start_date")) && !string.IsNullOrWhiteSpace(S(t, "end_date"))).ToArray();
        var undated = _tasks.Where(t => string.IsNullOrWhiteSpace(S(t, "start_date")) || string.IsNullOrWhiteSpace(S(t, "end_date"))).ToArray();
        var today = TodayIndex();
        if (!string.IsNullOrWhiteSpace(_rangeStart) && !string.IsNullOrWhiteSpace(_rangeEnd))
        {
            _startDay = DayIndex(_rangeStart!);
            _endDay = DayIndex(_rangeEnd!);
        }
        else if (dated.Length > 0)
        {
            _startDay = dated.Min(t => DayIndex(S(t, "start_date")));
            _endDay = dated.Max(t => DayIndex(S(t, "end_date")));
        }
        else { _startDay = today - 3; _endDay = today + 27; }

        var pad = Math.Max(3, (int)Math.Round((_endDay - _startDay) * .05));
        _startDay -= pad; _endDay += pad;
        if (_endDay - _startDay < 30)
        {
            var extra = 30 - (_endDay - _startDay);
            _startDay -= extra / 2;
            _endDay += (extra + 1) / 2;
        }
        _pixelsPerDay = _zoom;
        var span = _endDay - _startDay + 1;
        var width = Math.Max(Math.Max(700, span * _pixelsPerDay), _scroll.ViewportWidth);
        var sorted = dated.OrderBy(t => DayIndex(S(t, "start_date"))).ThenBy(t => N(t, "id")).ToArray();
        var laneEnds = new List<int>();
        _placed.Clear();
        foreach (var task in sorted)
        {
            var start = DayIndex(S(task, "start_date"));
            var end = Math.Max(start, DayIndex(S(task, "end_date")));
            var lane = laneEnds.FindIndex(last => last < start);
            if (lane < 0) { lane = laneEnds.Count; laneEnds.Add(end); }
            else laneEnds[lane] = end;
            _placed.Add((task, start, end, lane));
        }
        var laneCount = Math.Max(3, _placed.Count == 0 ? 0 : _placed.Max(p => p.Lane + 1));
        var height = Math.Max(RulerHeight + LaneGap + laneCount * (LaneHeight + LaneGap), _scroll.ViewportHeight);
        _canvas.Width = width;
        _canvas.Height = height;
        _canvas.Children.Clear();
        DrawRuler(width, height, today);
        foreach (var placed in _placed) DrawBar(placed.Task, placed.Start, placed.End, placed.Lane);

        _undated.Children.Clear();
        if (undated.Length > 0)
        {
            var label = new TextBlock { Text = "Без дат:", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 4, 0), FontSize = 12 };
            label.SetResourceReference(TextBlock.ForegroundProperty, "Brush.SidebarMuted");
            _undated.Children.Add(label);
            foreach (var task in undated)
            {
                var chip = TimelineButton(S(task, "title"), () => { _selectedId = N(task, "id"); UpdateSelectionVisuals(); _select(task); }, 0);
                chip.MinWidth = 0;
                chip.Padding = new Thickness(10, 3, 10, 3);
                if (N(task, "id") == _selectedId) chip.SetResourceReference(Control.BackgroundProperty, "Brush.TimelineGrid");
                _undated.Children.Add(chip);
            }
            _undated.Visibility = Visibility.Visible;
        }
        else _undated.Visibility = Visibility.Collapsed;
    }

    private void DrawRuler(double width, double height, int today)
    {
        var monthsLayer = new Border { Width = width, Height = 28 };
        monthsLayer.SetResourceReference(Border.BorderBrushProperty, "Brush.TimelineGrid");
        monthsLayer.BorderThickness = new Thickness(0, 0, 0, 1);
        Canvas.SetLeft(monthsLayer, 0); Canvas.SetTop(monthsLayer, 0); _canvas.Children.Add(monthsLayer);
        for (var day = _startDay; day <= _endDay;)
        {
            var next = Math.Min(NextMonthStart(day), _endDay + 1);
            var x = (day - _startDay) * _pixelsPerDay;
            var monthWidth = (next - day) * _pixelsPerDay;
            var label = new TextBlock { Text = MonthLabel(day), Margin = new Thickness(8, 5, 4, 0), FontSize = 12, FontWeight = FontWeights.SemiBold, TextTrimming = TextTrimming.CharacterEllipsis };
            label.SetResourceReference(TextBlock.ForegroundProperty, "Brush.SidebarText");
            var month = new Border { Width = monthWidth, Height = 28, BorderThickness = new Thickness(1, 0, 0, 0), Child = label };
            month.SetResourceReference(Border.BorderBrushProperty, "Brush.TimelineGrid");
            Canvas.SetLeft(month, x); Canvas.SetTop(month, 0); _canvas.Children.Add(month);
            day = next;
        }

        var step = new[] { 1, 2, 5, 7, 14, 30 }.FirstOrDefault(s => s * _pixelsPerDay >= 44);
        if (step == 0) step = 30;
        for (var day = _startDay; day <= _endDay; day++)
        {
            if ((day - _startDay) % step != 0) continue;
            var x = (day - _startDay) * _pixelsPerDay;
            var tick = new TextBlock { Text = DayOfMonth(day).ToString(CultureInfo.InvariantCulture), Margin = new Thickness(4, 5, 0, 0), FontSize = 11 };
            tick.SetResourceReference(TextBlock.ForegroundProperty, "Brush.TimelineRuler");
            Canvas.SetLeft(tick, x); Canvas.SetTop(tick, 28); _canvas.Children.Add(tick);
            var line = new Border { Width = 1, Height = height - RulerHeight };
            line.SetResourceReference(Border.BackgroundProperty, "Brush.TimelineGrid");
            Canvas.SetLeft(line, x); Canvas.SetTop(line, RulerHeight); _canvas.Children.Add(line);
        }

        var rulerBottom = new Border { Width = width, Height = 1 };
        rulerBottom.SetResourceReference(Border.BackgroundProperty, "Brush.TimelineGrid");
        Canvas.SetLeft(rulerBottom, 0); Canvas.SetTop(rulerBottom, RulerHeight - 1); _canvas.Children.Add(rulerBottom);
        if (today >= _startDay && today <= _endDay)
        {
            var todayLine = new Border { Width = 2, Height = height - RulerHeight, IsHitTestVisible = false };
            todayLine.SetResourceReference(Border.BackgroundProperty, "Brush.TimelineToday");
            Canvas.SetLeft(todayLine, (today - _startDay) * _pixelsPerDay + _pixelsPerDay / 2);
            Canvas.SetTop(todayLine, RulerHeight); _canvas.Children.Add(todayLine);
        }
    }

    private void DrawBar(JsonElement task, int start, int end, int lane)
    {
        var status = Statuses.FirstOrDefault(s => s.Id == N(task, "status_id"));
        if (status.Id == 0) status = Statuses[2];
        var color = status.Color;
        var width = Math.Max(4, (end - start + 1) * _pixelsPerDay - 2);
        var height = LaneHeight;
        var isTodo = S(task, "type") == "TODO";
        var selected = N(task, "id") == _selectedId;
        var bar = new Grid { Width = width, Height = height, Background = Brushes.Transparent, Tag = task, ToolTip = $"{S(task, "title")}\n{FormatDay(start)} — {FormatDay(end)}\n{status.Name}" };
        if (isTodo)
        {
            var notch = Math.Min(14, width / 2);
            var polygon = new Polygon
            {
                Points = new PointCollection { new(notch, 0), new(width - notch, 0), new(width, height / 2), new(width - notch, height), new(notch, height), new(0, height / 2) },
                Fill = Paint(color),
                StrokeThickness = 0
            };
            bar.Children.Add(polygon);
        }
        else
        {
            var bg = new Border { CornerRadius = new CornerRadius(4), Background = Paint(color), BorderThickness = new Thickness(1), BorderBrush = Paint("#66000000") };
            bar.Children.Add(bg);
        }

        var content = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(isTodo ? Math.Min(20, width / 3) : 10, 0, isTodo ? Math.Min(20, width / 3) : 10, 0), IsHitTestVisible = false };
        var title = new TextBlock { Text = (isTodo ? "▸ " : "◆ ") + S(task, "title"), FontSize = 12, FontWeight = FontWeights.SemiBold, TextTrimming = TextTrimming.CharacterEllipsis, Foreground = Paint(TextOn(color)) };
        content.Children.Add(title);
        if (width > 150)
        {
            var dates = new TextBlock { Text = $"{FormatDay(start)} — {FormatDay(end)}" + (width > 280 ? $" · {status.Name}" : ""), FontSize = 10, Opacity = .86, Foreground = Paint(TextOn(color)), Tag = "drag-date" };
            content.Children.Add(dates);
        }
        var tags = A(P(task, "tags")).ToArray();
        if (tags.Length > 0 && width > 190)
        {
            var tagRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 2, 0, 0) };
            foreach (var tag in tags.Take(3))
            {
                var tagColor = S(tag, "color_code");
                if (string.IsNullOrWhiteSpace(tagColor)) continue;
                var tagText = new TextBlock { Text = S(tag, "name"), FontSize = 9, Margin = new Thickness(4, 0, 4, 0), Foreground = Paint(TextOn(tagColor)) };
                var chip = new Border { Child = tagText, CornerRadius = new CornerRadius(8), Background = Paint(tagColor), Margin = new Thickness(0, 0, 4, 0), Padding = new Thickness(3, 0, 3, 0) };
                tagRow.Children.Add(chip);
            }
            content.Children.Add(tagRow);
        }
        bar.Children.Add(content);

        if (selected)
        {
            var outline = new Border { BorderBrush = Brushes.White, BorderThickness = new Thickness(2), IsHitTestVisible = false, Tag = "selection" };
            bar.Children.Add(outline);
        }
        if (_canEdit)
        {
            var handles = new Grid();
            handles.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(10) });
            handles.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            handles.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(10) });
            var leftHandle = Handle("left");
            var rightHandle = Handle("right");
            Grid.SetColumn(rightHandle, 2);
            handles.Children.Add(leftHandle);
            handles.Children.Add(rightHandle);
            bar.Children.Add(handles);
            bar.Cursor = Cursors.SizeAll;
            bar.MouseEnter += (_, _) => { leftHandle.Opacity = .65; rightHandle.Opacity = .65; };
            bar.MouseLeave += (_, _) => { if (_drag?.Bar != bar) { leftHandle.Opacity = 0; rightHandle.Opacity = 0; } };
        }
        Canvas.SetLeft(bar, (start - _startDay) * _pixelsPerDay);
        Canvas.SetTop(bar, RulerHeight + LaneGap + lane * (LaneHeight + LaneGap));
        bar.MouseLeftButtonDown += BarMouseDown;
        bar.MouseMove += BarMouseMove;
        bar.MouseLeftButtonUp += BarMouseUp;
        _canvas.Children.Add(bar);
    }

    private static Border Handle(string mode)
    {
        var handle = new Border { Width = 10, Background = Brushes.Transparent, Opacity = 0, Cursor = Cursors.SizeWE, Tag = mode, HorizontalAlignment = mode == "left" ? HorizontalAlignment.Left : HorizontalAlignment.Right };
        handle.Child = new Border { Width = 2, Background = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 14, 0, 14) };
        return handle;
    }

    internal void SetSelectedId(int? id)
    {
        _selectedId = id;
        UpdateSelectionVisuals();
    }

    private void UpdateSelectionVisuals()
    {
        foreach (var bar in _canvas.Children.OfType<Grid>().Where(g => g.Tag is JsonElement))
        {
            var existing = bar.Children.OfType<Border>().FirstOrDefault(b => Equals(b.Tag, "selection"));
            bool selected = bar.Tag is JsonElement task && N(task, "id") == _selectedId;
            if (selected && existing == null) bar.Children.Add(new Border { BorderBrush = Brushes.White, BorderThickness = new Thickness(2), IsHitTestVisible = false, Tag = "selection" });
            else if (!selected && existing != null) bar.Children.Remove(existing);
        }
    }

    private void BarMouseDown(object sender, MouseButtonEventArgs e)
    {
        if (sender is not Grid bar || bar.Tag is not JsonElement task) return;
        if (e.ClickCount > 1)
        {
            _open(task); e.Handled = true; return;
        }
        _selectedId = N(task, "id");
        UpdateSelectionVisuals();
        if (!_canEdit || e.ChangedButton != MouseButton.Left) return;
        var mode = "move";
        if (e.OriginalSource is DependencyObject source)
        {
            DependencyObject? current = source;
            while (current != null && !ReferenceEquals(current, bar))
            {
                if (current is FrameworkElement element && element.Tag is string handleMode && (handleMode == "left" || handleMode == "right"))
                { mode = handleMode; break; }
                current = VisualTreeHelper.GetParent(current);
            }
        }
        var placed = _placed.FirstOrDefault(p => N(p.Task, "id") == N(task, "id"));
        if (placed.Task.ValueKind == JsonValueKind.Undefined) return;
        _drag = new DragSession
        {
            Bar = bar, Task = task, Start = placed.Start, End = placed.End, Mode = mode,
            StartX = e.GetPosition(_scroll).X, StartScroll = _scroll.HorizontalOffset
        };
        bar.CaptureMouse();
        e.Handled = true;
    }

    private void BarMouseMove(object sender, MouseEventArgs e)
    {
        if (_drag is not { } drag || !ReferenceEquals(sender, drag.Bar) || e.LeftButton != MouseButtonState.Pressed) return;
        var pointer = e.GetPosition(_scroll).X;
        if (pointer > _scroll.ViewportWidth - 40) _scroll.ScrollToHorizontalOffset(_scroll.HorizontalOffset + 18);
        else if (pointer < 40) _scroll.ScrollToHorizontalOffset(_scroll.HorizontalOffset - 18);
        var px = pointer - drag.StartX + (_scroll.HorizontalOffset - drag.StartScroll);
        if (!drag.Moved && Math.Abs(px) < 4) return;
        drag.Moved = true;
        var delta = (int)Math.Round(px / _pixelsPerDay);
        var lo = !string.IsNullOrWhiteSpace(_rangeStart) ? DayIndex(_rangeStart!) : int.MinValue / 2;
        var hi = !string.IsNullOrWhiteSpace(_rangeEnd) ? DayIndex(_rangeEnd!) : int.MaxValue / 2;
        if (drag.Mode == "move")
            drag.DeltaStart = drag.DeltaEnd = Math.Clamp(delta, lo - drag.Start, hi - drag.End);
        else if (drag.Mode == "left")
            drag.DeltaStart = Math.Clamp(delta, lo - drag.Start, drag.End - drag.Start);
        else
            drag.DeltaEnd = Math.Clamp(delta, drag.Start - drag.End, hi - drag.End);
        var start = drag.Start + drag.DeltaStart;
        var end = drag.End + drag.DeltaEnd;
        var width = Math.Max(4, (end - start + 1) * _pixelsPerDay - 2);
        Canvas.SetLeft(drag.Bar, (start - _startDay) * _pixelsPerDay);
        drag.Bar.Width = width;
        UpdateBarGeometry(drag.Bar, S(drag.Task, "type") == "TODO", width);
        drag.Bar.ToolTip = $"{S(drag.Task, "title")}\n{FormatDay(start)} — {FormatDay(end)} · {end - start + 1} дн.";
        var dateLabel = drag.Bar.Children.OfType<StackPanel>().SelectMany(p => p.Children.OfType<TextBlock>()).FirstOrDefault(t => Equals(t.Tag, "drag-date"));
        if (dateLabel != null) dateLabel.Text = $"{FormatDay(start)} — {FormatDay(end)} · {end - start + 1} дн.";
    }

    private static void UpdateBarGeometry(Grid bar, bool isTodo, double width)
    {
        if (isTodo && bar.Children.OfType<Polygon>().FirstOrDefault() is { } polygon)
        {
            var notch = Math.Min(14, width / 2);
            polygon.Points = new PointCollection { new(notch, 0), new(width - notch, 0), new(width, LaneHeight / 2), new(width - notch, LaneHeight), new(notch, LaneHeight), new(0, LaneHeight / 2) };
        }
    }

    private async void BarMouseUp(object sender, MouseButtonEventArgs e)
    {
        if (sender is not Grid bar || bar.Tag is not JsonElement task) return;
        if (_drag is not { } drag || !ReferenceEquals(sender, drag.Bar))
        {
            if (!_canEdit) _select(task);
            return;
        }
        drag.Bar.ReleaseMouseCapture();
        _drag = null;
        if (!drag.Moved) { _select(drag.Task); return; }
        if (drag.DeltaStart == 0 && drag.DeltaEnd == 0) { Draw(); _select(drag.Task); return; }
        var start = drag.DeltaStart == 0 ? S(drag.Task, "start_date") : ShiftIso(S(drag.Task, "start_date"), drag.DeltaStart);
        var end = drag.DeltaEnd == 0 ? S(drag.Task, "end_date") : ShiftIso(S(drag.Task, "end_date"), drag.DeltaEnd);
        try
        {
            _error.Visibility = Visibility.Collapsed;
            await _changeDates(drag.Task, start, end);
        }
        catch (Exception ex)
        {
            _error.Text = ex.Message;
            _error.Visibility = Visibility.Visible;
            Draw();
            _select(drag.Task);
        }
    }
}
