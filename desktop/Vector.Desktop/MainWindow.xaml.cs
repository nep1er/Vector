using System.Collections.ObjectModel;
using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Vector.Desktop.Services;
using Vector.Desktop.Controls;

namespace Vector.Desktop;

public partial class MainWindow : Window
{
    private readonly ObservableCollection<ProjectCard> _projects = [];
    private readonly VectorApi _api = new();
    private string _apiBase => _api.BaseUrl;
    private bool _sessionBusy;
    private int _navigationVersion;

    public MainWindow()
    {
        ThemeService.Load();
        InitializeComponent();
        ProjectsItems.ItemsSource = _projects;
        Loaded += async (_, _) => { Hide(); await InitializeSessionAsync(); };
    }

    private async Task InitializeSessionAsync()
    {
        if (_sessionBusy) return;
        _sessionBusy = true;
        try
        {
            _api.Token = SessionStore.Load();
            while (true)
            {
                if (!string.IsNullOrWhiteSpace(_api.Token))
                {
                    try
                    {
                        var user = await _api.RequestAsync<UserDto>(HttpMethod.Get, "/api/auth/me");
                        ApplyProfile(user);
                        break;
                    }
                    catch (ApiException ex) when (ex.Status == 401)
                    {
                        SessionStore.Clear();
                        _api.Token = null;
                    }
                    catch (Exception ex)
                    {
                        if (MessageBox.Show(ex.Message + "\nПовторить подключение?", "Vector", MessageBoxButton.YesNo, MessageBoxImage.Warning) == MessageBoxResult.Yes)
                            continue;
                        Close();
                        return;
                    }
                }
                var auth = new AuthWindow(_api);
                if (auth.ShowDialog() != true) { Close(); return; }
            }
            Show();
            await LoadProjectsAsync();
            await LoadProfileAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Vector", MessageBoxButton.OK, MessageBoxImage.Error);
            Close();
        }
        finally { _sessionBusy = false; }
    }

    private void ApplyProfile(UserDto user)
    {
        ProfileName.Text = user.Username;
        ProfileEmail.Text = user.Email;
        MenuEmail.Text = user.Email;
        ProfileInitial.Text = string.IsNullOrWhiteSpace(user.Username) ? "?" : user.Username[..1].ToUpperInvariant();
        ProfileAvatar.Child = ProfileInitial;
        ProfileAvatar.SetResourceReference(Border.BackgroundProperty, "Brush.Accent");
        if (!string.IsNullOrWhiteSpace(user.AvatarUrl))
        {
            try
            {
                var uri = Uri.TryCreate(user.AvatarUrl, UriKind.Absolute, out var absolute) ? absolute : new Uri(new Uri(_apiBase + "/"), user.AvatarUrl.TrimStart('/'));
                var image = new BitmapImage(uri);
                ProfileAvatar.Child = null;
                ProfileAvatar.Background = new ImageBrush(image) { Stretch = Stretch.UniformToFill };
            }
            catch { }
        }
        else ProfileAvatar.SetResourceReference(Border.BackgroundProperty, "Brush.Accent");
    }

    private async Task LoadProjectsAsync()
    {
        int version = ++_navigationVersion;
        ProjectsItems.ItemsSource = _projects;
        _projects.Clear();
        EmptyState.Visibility = Visibility.Collapsed;
        StatusMessage.Visibility = Visibility.Visible;
        StatusMessage.Text = "Загрузка проектов…";
        try
        {
            var projects = await _api.RequestAsync<List<ProjectDto>>(HttpMethod.Get, "/api/projects");
            if (version != _navigationVersion) return;
            foreach (var project in projects) _projects.Add(new ProjectCard(project, _apiBase));
            ProjectsSummary.Text = _projects.Count > 0 ? $"Всего проектов: {_projects.Count}" : "";
            ProjectSearch.Text = "";
            ProjectSearch.Visibility = _projects.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
            SearchPlaceholder.Visibility = ProjectSearch.Visibility;
            StatusMessage.Visibility = Visibility.Collapsed;
            EmptyState.Visibility = _projects.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        }
        catch (ApiException ex) when (ex.Status == 401) { await LogoutAsync(); }
        catch (Exception ex)
        {
            if (version != _navigationVersion) return;
            StatusMessage.Text = $"Не удалось загрузить проекты: {ex.Message}";
            StatusMessage.Visibility = Visibility.Visible;
        }
    }

    private async Task LoadProfileAsync()
    {
        try
        {
            ApplyProfile(await _api.RequestAsync<UserDto>(HttpMethod.Get, "/api/auth/me"));
            var unread = await _api.RequestAsync<UnreadDto>(HttpMethod.Get, "/api/notifications/unread-count");
            UnreadCount.Text = unread.Count.ToString();
            UnreadBadge.Visibility = unread.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        }
        catch (ApiException ex) when (ex.Status == 401) { await LogoutAsync(); }
        catch { UnreadBadge.Visibility = Visibility.Collapsed; }
    }

    private void ProjectSearch_TextChanged(object sender, TextChangedEventArgs e)
    {
        SearchPlaceholder.Visibility = string.IsNullOrEmpty(ProjectSearch.Text) && _projects.Count > 0
            ? Visibility.Visible : Visibility.Collapsed;
        if (string.IsNullOrWhiteSpace(ProjectSearch.Text))
        {
            ProjectsItems.ItemsSource = _projects;
            return;
        }

        var query = ProjectSearch.Text.Trim();
        ProjectsItems.ItemsSource = _projects.Where(p =>
            (p.Title + " " + p.Description).Contains(query, StringComparison.CurrentCultureIgnoreCase)).ToList();
    }

    private void CreateProjectButton_Click(object sender, RoutedEventArgs e)
    {
        CreateError.Text = string.Empty;
        NewProjectTitle.Text = string.Empty;
        NewProjectDescription.Text = string.Empty;
        CreateOverlay.Visibility = Visibility.Visible;
        NewProjectTitle.Focus();
    }

    private void CloseCreateProject_Click(object sender, RoutedEventArgs e) =>
        CreateOverlay.Visibility = Visibility.Collapsed;

    private async void SubmitCreateProject_Click(object sender, RoutedEventArgs e)
    {
        var title = NewProjectTitle.Text.Trim();
        if (title.Length == 0) { CreateError.Text = "Введите название проекта"; return; }
        if (title.Length > 150) { CreateError.Text = "Название не должно быть длиннее 150 символов"; return; }
        SubmitCreateProject.IsEnabled = false;
        try
        {
            var created = await _api.RequestAsync<ProjectDto>(HttpMethod.Post, "/api/projects", new
            {
                title,
                description = string.IsNullOrWhiteSpace(NewProjectDescription.Text) ? null : NewProjectDescription.Text.Trim()
            });
            CreateOverlay.Visibility = Visibility.Collapsed;
            OpenProject(created.Id, null);
        }
        catch (ApiException ex) when (ex.Status == 401) { CreateOverlay.Visibility = Visibility.Collapsed; await LogoutAsync(); }
        catch (Exception ex) { CreateError.Text = ex.Message; }
        finally { SubmitCreateProject.IsEnabled = true; }
    }

    private async void NavigationButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { CommandParameter: string pageName } selected) return;
        foreach (var button in NavigationPanel.Children.OfType<Button>())
            button.Tag = ReferenceEquals(button, selected) ? "Active" : null;
        ++_navigationVersion;
        UserPopup.IsOpen = false;
        SectionContent.Content = null;
        SectionContent.Visibility = Visibility.Collapsed;
        RestoreShell();
        PageTitle.Text = pageName;
        var isProjects = pageName == "Проекты";
        CreateProjectButton.Visibility = isProjects ? Visibility.Visible : Visibility.Collapsed;
        ProjectsItems.Visibility = isProjects ? Visibility.Visible : Visibility.Collapsed;
        EmptyState.Visibility = Visibility.Collapsed;
        ProjectSearch.Visibility = Visibility.Collapsed;
        SearchPlaceholder.Visibility = Visibility.Collapsed;
        ProjectsSummary.Text = string.Empty;
        if (isProjects) await LoadProjectsAsync();
        else
        {
            StatusMessage.Visibility = Visibility.Collapsed;
            SectionContent.Content = pageName switch
            {
                "Друзья" => new FriendsView(_api, LogoutAsync),
                "Уведомления" => new NotificationsView(_api, LogoutAsync, LoadProfileAsync),
                "Задачи" => new TasksView(_api, LogoutAsync, OpenProject),
                _ => null
            };
            SectionContent.Visibility = SectionContent.Content is null ? Visibility.Collapsed : Visibility.Visible;
            if (SectionContent.Content is null)
            {
                StatusMessage.Text = $"Раздел «{pageName}» будет перенесён отдельным этапом.";
                StatusMessage.Visibility = Visibility.Visible;
            }
        }
    }

    private void ProjectCard_Click(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement { DataContext: ProjectCard card }) OpenProject(card.Id, null);
    }

    private void OpenProject(int id, int? task)
    {
        if (id <= 0) return;
        ++_navigationVersion;
        UserPopup.IsOpen = false;
        GlobalSidebar.Visibility = Visibility.Collapsed;
        SidebarColumn.Width = new GridLength(0);
        MainContent.Margin = new Thickness(0);
        PageHeader.Visibility = Visibility.Collapsed;
        ProjectsItems.Visibility = EmptyState.Visibility = StatusMessage.Visibility = Visibility.Collapsed;
        SectionContent.Content = new ProjectView(_api, LogoutAsync, id, task, BackToProjects);
        SectionContent.Visibility = Visibility.Visible;
    }

    private void RestoreShell()
    {
        GlobalSidebar.Visibility = Visibility.Visible;
        SidebarColumn.Width = new GridLength(264);
        MainContent.Margin = new Thickness(48,40,48,64);
        PageHeader.Visibility = Visibility.Visible;
    }

    private void BackToProjects()
    {
        var button = NavigationPanel.Children.OfType<Button>().First(b => Equals(b.CommandParameter, "Проекты"));
        NavigationButton_Click(button, new RoutedEventArgs());
    }

    private void ProfileButton_Click(object sender, RoutedEventArgs e)
    {
        if (UserPopup.IsOpen) { UserPopup.IsOpen = false; return; }
        UpdateThemeButtons();
        UserPopup.IsOpen = true;
    }

    private void UpdateThemeButtons()
    {
        foreach (var button in ThemeButtons.Children.OfType<Button>())
            button.Tag = Equals(button.CommandParameter, ThemeService.Current) ? "Active" : null;
    }

    private void Theme_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button { CommandParameter: string id })
        {
            ThemeService.Apply(id);
            UpdateThemeButtons();
        }
    }

    private void OpenProfile_Click(object sender, RoutedEventArgs e)
    {
        UserPopup.IsOpen = false;
        ++_navigationVersion;
        foreach (var button in NavigationPanel.Children.OfType<Button>()) button.Tag = null;
        PageTitle.Text = "Настройки профиля";
        ProjectsSummary.Text = "";
        ProjectSearch.Visibility = SearchPlaceholder.Visibility = CreateProjectButton.Visibility = ProjectsItems.Visibility = EmptyState.Visibility = StatusMessage.Visibility = Visibility.Collapsed;
        SectionContent.Content = new ProfileView(_api, LoadProfileAsync, LogoutAsync);
        SectionContent.Visibility = Visibility.Visible;
    }

    private async void Logout_Click(object sender, RoutedEventArgs e)
    {
        UserPopup.IsOpen = false;
        await LogoutAsync();
    }

    private async Task LogoutAsync()
    {
        if (_sessionBusy) { SessionStore.Clear(); _api.Token = null; Close(); return; }
        SessionStore.Clear();
        _api.Token = null;
        ++_navigationVersion;
        _projects.Clear();
        UserPopup.IsOpen = false;
        SectionContent.Content = null;
        SectionContent.Visibility = Visibility.Collapsed;
        ProfileAvatar.Child = ProfileInitial;
        ProfileAvatar.SetResourceReference(Border.BackgroundProperty, "Brush.Accent");
        ProfileInitial.Text = "?";
        ProfileName.Text = "";
        ProfileEmail.Text = "";
        UnreadBadge.Visibility = Visibility.Collapsed;
        CreateOverlay.Visibility = Visibility.Collapsed;
        foreach (var button in NavigationPanel.Children.OfType<Button>())
            button.Tag = Equals(button.CommandParameter, "Проекты") ? "Active" : null;
        RestoreShell();
        PageTitle.Text = "Проекты";
        ProjectsItems.Visibility = CreateProjectButton.Visibility = Visibility.Visible;
        Hide();
        await InitializeSessionAsync();
    }

    private sealed class UserDto
    {
        [JsonPropertyName("username")] public string Username { get; set; } = "";
        [JsonPropertyName("email")] public string Email { get; set; } = "";
        [JsonPropertyName("avatar_url")] public string? AvatarUrl { get; set; }
    }

    private sealed class UnreadDto
    {
        [JsonPropertyName("count")] public int Count { get; set; }
    }

    private sealed class ProjectDto
    {
        [JsonPropertyName("id")] public int Id { get; set; }
        [JsonPropertyName("title")] public string Title { get; set; } = "";
        [JsonPropertyName("description")] public string? Description { get; set; }
        [JsonPropertyName("created_at")] public DateTime CreatedAt { get; set; }
        [JsonPropertyName("avatar_url")] public string? AvatarUrl { get; set; }
    }

    private sealed class ProjectCard
    {
        private static readonly string[] Gradients =
        [
            "#7A1616|#2A1208", "#9B1C1C|#4A2A10", "#5A3D1C|#241709",
            "#8A5A1C|#3A1F0C", "#6B2A2A|#1F1410", "#3F2D19|#17100A"
        ];

        public int Id { get; }
        public string Title { get; }
        public string Description { get; }
        public string Initial { get; }
        public string CreatedLabel { get; }
        public Brush CoverBrush { get; }
        public ImageSource? Avatar { get; }

        public ProjectCard(ProjectDto project, string apiBase)
        {
            Id = project.Id;
            Title = project.Title;
            Description = string.IsNullOrWhiteSpace(project.Description) ? "Без описания" : project.Description;
            Initial = project.Title.Trim().FirstOrDefault().ToString().ToUpperInvariant();
            CreatedLabel = $"Создан {project.CreatedAt.ToLocalTime().ToString("d", CultureInfo.GetCultureInfo("ru-RU"))}";
            var colors = Gradients[Math.Abs(project.Id % Gradients.Length)].Split('|');
            CoverBrush = new LinearGradientBrush((Color)ColorConverter.ConvertFromString(colors[0]),
                (Color)ColorConverter.ConvertFromString(colors[1]), 35);
            if (!string.IsNullOrWhiteSpace(project.AvatarUrl))
            {
                try
                {
                    var bitmap = new BitmapImage();
                    bitmap.BeginInit();
                    bitmap.UriSource = Uri.TryCreate(project.AvatarUrl, UriKind.Absolute, out var uri)
                        ? uri : new Uri(new Uri(apiBase.TrimEnd('/') + "/"), project.AvatarUrl.TrimStart('/'));
                    bitmap.CacheOption = BitmapCacheOption.OnLoad;
                    bitmap.EndInit();
                    Avatar = bitmap;
                }
                catch { }
            }
        }
    }
}