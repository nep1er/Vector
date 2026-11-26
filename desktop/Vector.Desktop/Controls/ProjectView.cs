using System.Globalization;
using System.Net.Http;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using Vector.Desktop.Services;

namespace Vector.Desktop.Controls;

/// <summary>Экран RoadMap проекта. Временная шкала и взаимодействие повторяют Web Timeline.</summary>
internal sealed class ProjectView : SectionView
{
    private readonly int _id;
    private readonly Action _back;
    private JsonElement _project;
    private JsonElement[] _roots = [], _members = [], _tags = [], _roles = [];
    private JsonElement _current;
    private int? _selectedId;
    private readonly StackPanel _content = new();
    private ContentControl _timelineHost = new(), _inspectorHost = new();
    private ColumnDefinition _inspectorColumn = new() { Width = new GridLength(0) };
    private readonly HashSet<int> _statusFilters = [];
    private readonly HashSet<int> _tagFilters = [];
    private DateTime? _filterFrom, _filterTo;
    private readonly List<CheckBox> _filterChecks = [];
    private DatePicker? _filterFromPicker, _filterToPicker;
    private Popup? _filterPopup;
    private Button? _filterButton;

    private bool Can(string right) => A(P(_project, "permissions")).Any(p => p.GetString() == right || p.GetString() == "ADMIN");

    private static readonly (int Id, string Name, string Color)[] Statuses =
    [
        (1, "Выполнено", "#2F9E5B"), (2, "В процессе", "#D9A21B"),
        (3, "В плане", "#4A8FD6"), (4, "Просрочено", "#E0483E"),
        (5, "Заморожено", "#7FB7C9"), (6, "Неактивно", "#8A8A8A")
    ];

    internal ProjectView(VectorApi api, Func<Task> logout, int id, int? initial, Action back) : base(api, logout)
    {
        _id = id;
        _back = back;
        Body.Children.Add(_content);
        Loaded += async (_, _) => await Run(() => Load(initial, null));
    }

    private async Task Load(int? currentId, int? selectedId)
    {
        var projectTask = Get($"/api/projects/{_id}");
        var treeTask = Get($"/api/tasks/projects/{_id}/tree");
        var membersTask = Get($"/api/projects/{_id}/participants");
        var tagsTask = Get($"/api/task-tags/project/{_id}");
        var rolesTask = Get($"/api/roles/project/{_id}");
        await Task.WhenAll(projectTask, treeTask, membersTask, tagsTask, rolesTask);
        _project = await projectTask;
        _roots = A(await treeTask).ToArray();
        _members = A(await membersTask).ToArray();
        _tags = A(await tagsTask).ToArray();
        _roles = A(await rolesTask).ToArray();
        _current = currentId.HasValue ? Find(_roots, currentId.Value) : _roots.FirstOrDefault();
        if (_current.ValueKind == JsonValueKind.Undefined) _current = _roots.FirstOrDefault();
        _selectedId = selectedId;
        if (_selectedId.HasValue && Find(A(P(_current, "children")), _selectedId.Value).ValueKind == JsonValueKind.Undefined)
            _selectedId = null;
        Render();
    }

    private static JsonElement Find(IEnumerable<JsonElement> nodes, int id)
    {
        foreach (var node in nodes)
        {
            if (N(node, "id") == id) return node;
            var found = Find(A(P(node, "children")), id);
            if (found.ValueKind != JsonValueKind.Undefined) return found;
        }
        return default;
    }

    private void Render()
    {
        _filterPopup?.SetCurrentValue(Popup.IsOpenProperty, false);
        _timelineHost = new ContentControl();
        _inspectorHost = new ContentControl();
        _inspectorColumn = new ColumnDefinition { Width = new GridLength(0) };
        _content.Children.Clear();
        if (_roots.Length == 0 || _current.ValueKind == JsonValueKind.Undefined)
        {
            _content.Children.Add(Panel(Text("Этап RoadMap не найден", 20, true)));
            return;
        }
        if (S(_current, "type") != "ROADMAP")
        {
            _content.Children.Add(Panel(Text("Выберите этап RoadMap, чтобы открыть временную шкалу.", 16)));
            return;
        }

        var shell = new Grid();
        shell.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(56) });
        shell.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var rail = BuildProjectRail();
        var railBox = new Border { Child = rail, Padding = new Thickness(5), MinHeight = 480 };
        railBox.SetResourceReference(Border.BackgroundProperty, "Brush.Sidebar");
        shell.Children.Add(railBox);

        var main = new StackPanel { Margin = new Thickness(16, 0, 0, 0) };
        Grid.SetColumn(main, 1);
        shell.Children.Add(main);
        main.Children.Add(BuildHeader());
        var timelineGrid = new Grid { Margin = new Thickness(0, 12, 0, 0) };
        timelineGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        timelineGrid.ColumnDefinitions.Add(_inspectorColumn);
        _timelineHost.MinWidth = 0;
        timelineGrid.Children.Add(_timelineHost);
        Grid.SetColumn(_inspectorHost, 1);
        timelineGrid.Children.Add(_inspectorHost);
        main.Children.Add(timelineGrid);
        _content.Children.Add(shell);

        RefreshTimeline();
        UpdateInspector();
    }

    private StackPanel BuildProjectRail()
    {
        var rail = new StackPanel();
        rail.Children.Add(Button("‹", () => { _back(); return Task.CompletedTask; }));
        rail.Children.Add(Button("♙", () => Run(Members)));
        foreach (var member in _members)
        {
            var name = S(member, "username");
            var avatar = new Border { Width = 30, Height = 30, CornerRadius = new CornerRadius(15), Margin = new Thickness(0, 5, 0, 5), ToolTip = name };
            avatar.SetResourceReference(Border.BackgroundProperty, "Brush.Accent");
            avatar.Child = new TextBlock { Text = name.Length > 0 ? name[..1].ToUpperInvariant() : "?", Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            rail.Children.Add(avatar);
        }
        if (Can("ADMIN")) rail.Children.Add(Button("♙+", () => Run(Invite)));
        if (Can("EXECUTE") || Can("WRITE")) rail.Children.Add(Button("+", () => Run(Create), true));
        rail.Children.Add(Button("⚙", () => Run(Info)));
        return rail;
    }

    private UIElement BuildHeader()
    {
        var header = new DockPanel { LastChildFill = true, Margin = new Thickness(0, 0, 0, 10) };
        var actions = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        var parentId = N(_current, "parent_roadmap_id");
        if (parentId > 0)
            actions.Children.Add(Button("←  Родительский этап", () => Run(() => Load(parentId, null))));
        _filterButton = Button(FilterLabel(), () => { if (_filterPopup != null) _filterPopup.IsOpen = !_filterPopup.IsOpen; return Task.CompletedTask; });
        _filterButton.Margin = new Thickness(0, 0, 8, 0);
        actions.Children.Add(_filterButton);
        if (Can("EXECUTE") || Can("WRITE"))
            actions.Children.Add(Button("+  Добавить задачу", () => Run(Create), true));
        DockPanel.SetDock(actions, Dock.Right);
        header.Children.Add(actions);

        var labels = new StackPanel();
        labels.Children.Add(Text("Проекты  /  " + S(_project, "title"), 13, false));
        var current = Text(S(_current, "title"), 24, true);
        current.Margin = new Thickness(0, 3, 0, 0);
        labels.Children.Add(current);
        header.Children.Add(labels);

        _filterPopup = BuildFilterPopup();
        _filterPopup.PlacementTarget = _filterButton;
        var root = new Grid();
        root.Children.Add(header);
        root.Children.Add(_filterPopup);
        return root;
    }

    private Popup BuildFilterPopup()
    {
        var panel = new StackPanel { Margin = new Thickness(14) };
        panel.Children.Add(Text("Статус", 14, true));
        _filterChecks.Clear();
        foreach (var status in Statuses)
        {
            var check = new CheckBox { Content = status.Name, Tag = "status:" + status.Id, IsChecked = _statusFilters.Contains(status.Id), Margin = new Thickness(0, 4, 0, 4) };
            check.SetResourceReference(Control.ForegroundProperty, "Brush.SidebarText");
            check.Checked += FilterChanged;
            check.Unchecked += FilterChanged;
            _filterChecks.Add(check);
            panel.Children.Add(check);
        }
        if (_tags.Length > 0)
        {
            panel.Children.Add(Text("Теги", 14, true));
            foreach (var tag in _tags)
            {
                var check = new CheckBox { Content = S(tag, "name"), Tag = "tag:" + N(tag, "id"), IsChecked = _tagFilters.Contains(N(tag, "id")), Margin = new Thickness(0, 4, 0, 4) };
                check.SetResourceReference(Control.ForegroundProperty, "Brush.Text");
                check.Checked += FilterChanged;
                check.Unchecked += FilterChanged;
                _filterChecks.Add(check);
                panel.Children.Add(check);
            }
        }
        panel.Children.Add(Text("Период", 14, true));
        var fromRow = new DockPanel { Margin = new Thickness(0, 6, 0, 0) };
        fromRow.Children.Add(Text("С", 13));
        _filterFromPicker = new DatePicker { SelectedDate = _filterFrom, Margin = new Thickness(12, 0, 0, 0), Width = 170 };
        _filterFromPicker.SelectedDateChanged += (_, _) => { _filterFrom = _filterFromPicker.SelectedDate; RefreshTimeline(); };
        fromRow.Children.Add(_filterFromPicker);
        panel.Children.Add(fromRow);
        var toRow = new DockPanel { Margin = new Thickness(0, 6, 0, 0) };
        toRow.Children.Add(Text("По", 13));
        _filterToPicker = new DatePicker { SelectedDate = _filterTo, Margin = new Thickness(12, 0, 0, 0), Width = 170 };
        _filterToPicker.SelectedDateChanged += (_, _) => { _filterTo = _filterToPicker.SelectedDate; RefreshTimeline(); };
        toRow.Children.Add(_filterToPicker);
        panel.Children.Add(toRow);
        panel.Children.Add(Button("Сбросить фильтры", () =>
        {
            _statusFilters.Clear(); _tagFilters.Clear(); _filterFrom = _filterTo = null;
            _filterFromPicker.SelectedDate = null; _filterToPicker.SelectedDate = null;
            foreach (var check in _filterChecks) check.IsChecked = false;
            RefreshTimeline();
            return Task.CompletedTask;
        }));
        var border = new Border { Width = 270, Child = panel, CornerRadius = new CornerRadius(8), BorderThickness = new Thickness(1), Padding = new Thickness(2) };
        border.SetResourceReference(Border.BackgroundProperty, "Brush.SidebarMenu");
        border.SetResourceReference(Border.BorderBrushProperty, "Brush.SidebarBorder");
        return new Popup { Placement = PlacementMode.Bottom, StaysOpen = false, AllowsTransparency = true, Child = border };
    }

    private void FilterChanged(object sender, RoutedEventArgs e)
    {
        if (sender is not CheckBox check || check.Tag is not string key) return;
        var parts = key.Split(':');
        if (parts.Length != 2 || !int.TryParse(parts[1], out var id)) return;
        var target = parts[0] == "status" ? _statusFilters : _tagFilters;
        if (check.IsChecked == true) target.Add(id); else target.Remove(id);
        RefreshTimeline();
    }

    private string FilterLabel()
    {
        var count = _statusFilters.Count + _tagFilters.Count + (_filterFrom.HasValue ? 1 : 0) + (_filterTo.HasValue ? 1 : 0);
        return count > 0 ? $"Фильтры · {count}" : "Фильтры";
    }

    private bool MatchesFilters(JsonElement task)
    {
        if (_statusFilters.Count > 0 && !_statusFilters.Contains(N(task, "status_id"))) return false;
        if (_tagFilters.Count > 0 && !A(P(task, "tags")).Any(t => _tagFilters.Contains(N(t, "id")))) return false;
        if (_filterFrom.HasValue && DateTimeOffset.TryParse(S(task, "end_date"), out var end) && end.UtcDateTime.Date < _filterFrom.Value.Date) return false;
        if (_filterTo.HasValue && DateTimeOffset.TryParse(S(task, "start_date"), out var start) && start.UtcDateTime.Date > _filterTo.Value.Date) return false;
        return true;
    }

    private void RefreshTimeline()
    {
        if (_current.ValueKind != JsonValueKind.Object || S(_current, "type") != "ROADMAP") return;
        var tasks = A(P(_current, "children")).Where(MatchesFilters).ToArray();
        var timeline = new RoadmapTimeline(
            tasks,
            S(_current, "start_date"),
            S(_current, "end_date"),
            _selectedId,
            Can("EXECUTE"),
            async (task, start, end) =>
            {
                await Api.RequestAsync<JsonElement>(HttpMethod.Patch, $"/api/tasks/{N(task, "id")}/dates",
                    new { startDate = start, endDate = end, shiftChildren = true });
                await Load(N(_current, "id"), N(task, "id"));
            },
            task => { _selectedId = task.HasValue ? N(task.Value, "id") : null; UpdateInspector(); },
            OpenTask);
        _timelineHost.Content = timeline;
        if (_filterButton != null) _filterButton.Content = FilterLabel();
    }

    private void OpenTask(JsonElement task)
    {
        if (S(task, "type") == "ROADMAP")
        {
            _filterPopup!.IsOpen = false;
            _ = Run(() => Load(N(task, "id"), null));
        }
        else MessageBox.Show("Открытие доски ToDo будет перенесено отдельным этапом. Задачу можно выбрать и отредактировать в инспекторе.", "Vector", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void UpdateInspector()
    {
        _inspectorHost.Content = null;
        if (!_selectedId.HasValue)
        {
            if (_timelineHost.Content is RoadmapTimeline timeline) timeline.SetSelectedId(null);
            _inspectorColumn.Width = new GridLength(0);
            return;
        }
        var task = Find(A(P(_current, "children")), _selectedId.Value);
        if (task.ValueKind != JsonValueKind.Object) { _selectedId = null; _inspectorColumn.Width = new GridLength(0); return; }
        _inspectorColumn.Width = new GridLength(310);
        _inspectorHost.Content = BuildInspector(task);
    }

    private UIElement BuildInspector(JsonElement task)
    {
        bool canEdit = Can("EXECUTE");
        int taskId = N(task, "id");
        var panel = new StackPanel { Margin = new Thickness(14) };
        var head = new DockPanel { Margin = new Thickness(0, 0, 0, 12) };
        var close = Button("×", () => { _selectedId = null; UpdateInspector(); return Task.CompletedTask; });
        DockPanel.SetDock(close, Dock.Right); head.Children.Add(close);
        head.Children.Add(Text(S(task, "type") == "ROADMAP" ? "RoadMap" : "ToDo", 14, true));
        panel.Children.Add(head);

        panel.Children.Add(Text("Статус", 13, true));
        var status = new ComboBox { Margin = new Thickness(0, 5, 0, 12), IsEnabled = canEdit };
        foreach (var item in Statuses) status.Items.Add(new ComboBoxItem { Content = item.Name, Tag = item.Id });
        status.SelectedItem = status.Items.Cast<ComboBoxItem>().FirstOrDefault(x => (int)x.Tag == N(task, "status_id"));
        panel.Children.Add(status);

        panel.Children.Add(Text("Название", 13, true));
        var title = Input("Название задачи");
        title.Text = S(task, "title"); title.IsEnabled = canEdit; title.Margin = new Thickness(0, 5, 0, 12);
        panel.Children.Add(title);

        panel.Children.Add(Text("Начало", 13, true));
        var start = new DatePicker { SelectedDate = ParseDate(S(task, "start_date")), IsEnabled = canEdit, Margin = new Thickness(0, 5, 0, 10) };
        panel.Children.Add(start);
        panel.Children.Add(Text("Окончание", 13, true));
        var end = new DatePicker { SelectedDate = ParseDate(S(task, "end_date")), IsEnabled = canEdit, Margin = new Thickness(0, 5, 0, 12) };
        panel.Children.Add(end);

        panel.Children.Add(Text("Теги", 13, true));
        var tagChecks = new List<CheckBox>();
        foreach (var tag in _tags)
        {
            int id = N(tag, "id");
            var check = new CheckBox { Content = S(tag, "name"), Tag = id, IsChecked = A(P(task, "tags")).Any(t => N(t, "id") == id), IsEnabled = canEdit, Margin = new Thickness(0, 4, 0, 4) };
            check.SetResourceReference(Control.ForegroundProperty, "Brush.Text");
            tagChecks.Add(check); panel.Children.Add(check);
        }
        panel.Children.Add(Text("Видимость", 13, true));
        var visible = A(P(task, "visible_roles")).ToArray();
        var allRoles = new CheckBox { Content = "Все участники", IsChecked = visible.Length == 0, IsEnabled = canEdit, Margin = new Thickness(0, 4, 0, 4) };
        allRoles.SetResourceReference(Control.ForegroundProperty, "Brush.Text");
        panel.Children.Add(allRoles);
        var roleChecks = new List<CheckBox>();
        foreach (var role in _roles)
        {
            int id = N(role, "id");
            var check = new CheckBox { Content = S(role, "name"), Tag = id, IsChecked = visible.Any(v => N(v, "id") == id), IsEnabled = canEdit && visible.Length > 0, Margin = new Thickness(0, 4, 0, 4) };
            check.SetResourceReference(Control.ForegroundProperty, "Brush.Text");
            roleChecks.Add(check); panel.Children.Add(check);
        }
        allRoles.Checked += (_, _) => roleChecks.ForEach(c => c.IsEnabled = false);
        allRoles.Unchecked += (_, _) => roleChecks.ForEach(c => c.IsEnabled = canEdit);

        if (canEdit)
        {
            panel.Children.Add(Button("Сохранить изменения", () => Run(async () =>
            {
                var cleanTitle = title.Text.Trim();
                if (cleanTitle.Length == 0) throw new InvalidOperationException("Название не может быть пустым.");
                var oldStart = ParseDate(S(task, "start_date"));
                var oldEnd = ParseDate(S(task, "end_date"));
                if (start.SelectedDate != oldStart || end.SelectedDate != oldEnd)
                {
                    if (!start.SelectedDate.HasValue || !end.SelectedDate.HasValue || start.SelectedDate > end.SelectedDate)
                        throw new InvalidOperationException("Укажите корректные даты начала и окончания.");
                }
                if (cleanTitle != S(task, "title"))
                    await Api.RequestAsync<JsonElement>(HttpMethod.Patch, $"/api/tasks/{taskId}/title", new { title = cleanTitle });
                if (start.SelectedDate != oldStart || end.SelectedDate != oldEnd)
                    await Api.RequestAsync<JsonElement>(HttpMethod.Patch, $"/api/tasks/{taskId}/dates", new
                    {
                        startDate = start.SelectedDate!.Value.ToString("yyyy-MM-dd'T'00:00:00.000'Z'", CultureInfo.InvariantCulture),
                        endDate = end.SelectedDate!.Value.ToString("yyyy-MM-dd'T'23:59:59.000'Z'", CultureInfo.InvariantCulture),
                        shiftChildren = false
                    });
                if (status.SelectedItem is ComboBoxItem selectedStatus && (int)selectedStatus.Tag != N(task, "status_id"))
                    await Api.RequestAsync<JsonElement>(HttpMethod.Patch, $"/api/tasks/{taskId}/status", new { statusId = (int)selectedStatus.Tag });
                var tagIds = tagChecks.Where(c => c.IsChecked == true).Select(c => (int)c.Tag).ToArray();
                var oldTagIds = A(P(task, "tags")).Select(t => N(t, "id")).Order().ToArray();
                if (!tagIds.Order().SequenceEqual(oldTagIds))
                    await Api.RequestAsync<JsonElement>(HttpMethod.Put, $"/api/task-tags/tasks/{taskId}", new { tagIds });
                int[] roleIds = allRoles.IsChecked == true ? Array.Empty<int>() : roleChecks.Where(c => c.IsChecked == true).Select(c => (int)c.Tag).ToArray();
                var oldRoleIds = visible.Select(v => N(v, "id")).Order().ToArray();
                if (!roleIds.Order().SequenceEqual(oldRoleIds))
                    await Api.RequestAsync<JsonElement>(HttpMethod.Put, $"/api/tasks/{taskId}/visibility", new { roleIds });
                await Load(N(_current, "id"), taskId);
            }), true));
            panel.Children.Add(Button("Удалить задачу", () => Run(async () =>
            {
                var warning = S(task, "type") == "ROADMAP" && A(P(task, "children")).Any()
                    ? "Удалить этап и все вложенные задачи?"
                    : "Удалить задачу?";
                if (MessageBox.Show(warning, "Vector", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
                await Api.RequestAsync<JsonElement>(HttpMethod.Delete, $"/api/tasks/{taskId}");
                await Load(N(_current, "id"), null);
            })));
        }
        if (S(task, "type") == "ROADMAP")
            panel.Children.Add(Button($"Открыть RoadMap ({A(P(task, "children")).Count()})", () => Run(() => Load(taskId, null))));
        else
            panel.Children.Add(Button("Открыть доску", () => { OpenTask(task); return Task.CompletedTask; }));

        var border = new Border { Child = new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto }, CornerRadius = new CornerRadius(8), BorderThickness = new Thickness(1), Margin = new Thickness(12, 0, 0, 0), MaxHeight = 470 };
        border.SetResourceReference(Border.BackgroundProperty, "Brush.Surface");
        border.SetResourceReference(Border.BorderBrushProperty, "Brush.BorderStrong");
        return border;
    }

    private static DateTime? ParseDate(string value) =>
        DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date) ? date.UtcDateTime.Date : null;

    private Task Members()
    {
        var panel = new StackPanel { Margin = new Thickness(24) };
        foreach (var member in _members)
            panel.Children.Add(Text(S(member, "username") + " · " + string.Join(", ", A(P(member, "roles")).Select(role => S(role, "name")))));
        Dialog("Участники", panel, null);
        return Task.CompletedTask;
    }

    private Task Info()
    {
        var panel = new StackPanel { Margin = new Thickness(24) };
        panel.Children.Add(Text(S(_project, "title"), 24, true));
        panel.Children.Add(Text(S(_project, "description")));
        Dialog("О проекте", panel, null);
        return Task.CompletedTask;
    }

    private async Task Invite()
    {
        var panel = new StackPanel { Margin = new Thickness(24) };
        panel.Children.Add(Text("Email или имя пользователя"));
        var input = Input("Email или имя пользователя"); panel.Children.Add(input);
        if (Dialog("Пригласить участника", panel, () => input.Text.Trim().Length > 0))
        {
            await Post($"/api/projects/{_id}/invitations", new { identifier = input.Text.Trim() });
            await Load(N(_current, "id"), _selectedId);
        }
    }

    private async Task Create()
    {
        if (S(_current, "type") != "ROADMAP") return;
        var panel = new StackPanel { Margin = new Thickness(24) };
        var kind = new ComboBox();
        if (Can("EXECUTE")) kind.Items.Add("ROADMAP");
        if (Can("WRITE")) kind.Items.Add("TODO");
        kind.SelectedIndex = 0;
        var title = Input("Название"); title.MaxLength = 200;
        var start = new DatePicker { SelectedDate = ParseDate(S(_current, "start_date")) ?? DateTime.Today };
        var end = new DatePicker { SelectedDate = ParseDate(S(_current, "end_date")) ?? DateTime.Today.AddDays(13) };
        foreach (var pair in new (string, UIElement)[] { ("Тип", kind), ("Название", title), ("Начало", start), ("Окончание", end) })
        { panel.Children.Add(Text(pair.Item1, 14, true)); panel.Children.Add(pair.Item2); }
        if (!Dialog("Новая задача", panel, () => title.Text.Trim().Length > 0 && start.SelectedDate.HasValue && end.SelectedDate.HasValue && start.SelectedDate <= end.SelectedDate)) return;
        int parent = N(_current, "id");
        var body = new
        {
            title = title.Text.Trim(), parentRoadmapId = parent,
            startDate = start.SelectedDate!.Value.ToString("yyyy-MM-dd'T'00:00:00.000'Z'", CultureInfo.InvariantCulture),
            endDate = end.SelectedDate!.Value.ToString("yyyy-MM-dd'T'23:59:59.000'Z'", CultureInfo.InvariantCulture)
        };
        await Post($"/api/tasks/projects/{_id}/" + (Equals(kind.SelectedItem, "ROADMAP") ? "roadmap" : "todo"), body);
        await Load(parent, null);
    }

    private bool Dialog(string title, StackPanel panel, Func<bool>? validate)
    {
        var window = new Window { Title = title, Width = 460, SizeToContent = SizeToContent.Height, WindowStartupLocation = WindowStartupLocation.CenterOwner, Owner = Window.GetWindow(this), Content = panel };
        window.SetResourceReference(Window.BackgroundProperty, "Brush.Background");
        var button = Button(validate == null ? "Закрыть" : "Сохранить", () => { if (validate == null || validate()) window.DialogResult = true; else MessageBox.Show("Проверьте заполнение полей."); return Task.CompletedTask; }, true);
        button.Margin = new Thickness(0, 16, 0, 0);
        panel.Children.Add(button);
        return window.ShowDialog() == true;
    }
}
