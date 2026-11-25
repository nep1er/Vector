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

namespace Vector.Desktop;

public partial class MainWindow : Window
{
    private static readonly HttpClient Http = new();
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly ObservableCollection<ProjectCard> _projects = [];
    private readonly string _apiBase = Environment.GetEnvironmentVariable("VECTOR_API_URL") ?? "http://localhost:5000";
    private string? _token;

    public MainWindow()
    {
        InitializeComponent();
        ProjectsItems.ItemsSource = _projects;
        _token = Environment.GetEnvironmentVariable("VECTOR_TOKEN") ?? ReadLocalToken();
        Loaded += async (_, _) =>
        {
            await LoadProjectsAsync();
            await LoadProfileAsync();
        };
    }

    private static string? ReadLocalToken()
    {
        try
        {
            var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Vector", "session.json");
            if (!File.Exists(path)) return null;
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            return document.RootElement.TryGetProperty("token", out var token) ? token.GetString() : null;
        }
        catch { return null; }
    }

    private async Task LoadProjectsAsync()
    {
        ProjectsItems.ItemsSource = _projects;
        _projects.Clear();
        EmptyState.Visibility = Visibility.Collapsed;
        StatusMessage.Visibility = Visibility.Visible;
        StatusMessage.Text = _token is null
            ? "Для загрузки проектов задайте токен Vector в %AppData%\\Vector\\session.json."
            : "Загрузка проектов…";

        if (string.IsNullOrWhiteSpace(_token)) return;

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"{_apiBase.TrimEnd('/')}/api/projects");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
            using var response = await Http.SendAsync(request);
            if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                throw new InvalidOperationException("Сессия истекла. Обновите токен авторизации.");
            response.EnsureSuccessStatusCode();
            var projects = await JsonSerializer.DeserializeAsync<List<ProjectDto>>(
                await response.Content.ReadAsStreamAsync(), JsonOptions) ?? [];
            foreach (var project in projects)
                _projects.Add(new ProjectCard(project, _apiBase));
            ProjectsSummary.Text = _projects.Count > 0 ? $"Всего проектов: {_projects.Count}" : string.Empty;
            ProjectSearch.Visibility = _projects.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
            SearchPlaceholder.Visibility = _projects.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
            StatusMessage.Visibility = Visibility.Collapsed;
            EmptyState.Visibility = _projects.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        }
        catch (Exception ex)
        {
            StatusMessage.Text = $"Не удалось загрузить проекты: {ex.Message}";
            StatusMessage.Visibility = Visibility.Visible;
        }
    }

    private async Task LoadProfileAsync()
    {
        if (string.IsNullOrWhiteSpace(_token)) return;
        try
        {
            using var userRequest = new HttpRequestMessage(HttpMethod.Get, $"{_apiBase.TrimEnd('/')}/api/auth/me");
            userRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
            using var userResponse = await Http.SendAsync(userRequest);
            if (userResponse.IsSuccessStatusCode)
            {
                var user = await JsonSerializer.DeserializeAsync<UserDto>(await userResponse.Content.ReadAsStreamAsync(), JsonOptions);
                if (user is not null)
                {
                    ProfileName.Text = user.Username;
                    ProfileEmail.Text = user.Email;
                    ProfileInitial.Text = string.IsNullOrWhiteSpace(user.Username) ? "?" : user.Username[..1].ToUpperInvariant();
                    if (!string.IsNullOrWhiteSpace(user.AvatarUrl))
                    {
                        var avatarUri = Uri.TryCreate(user.AvatarUrl, UriKind.Absolute, out var absolute)
                            ? absolute : new Uri(new Uri(_apiBase.TrimEnd('/') + "/"), user.AvatarUrl.TrimStart('/'));
                        ProfileAvatar.Child = new System.Windows.Controls.Image
                        {
                            Source = new BitmapImage(avatarUri),
                            Stretch = Stretch.UniformToFill
                        };
                    }
                }
            }

            using var unreadRequest = new HttpRequestMessage(HttpMethod.Get, $"{_apiBase.TrimEnd('/')}/api/notifications/unread-count");
            unreadRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
            using var unreadResponse = await Http.SendAsync(unreadRequest);
            if (unreadResponse.IsSuccessStatusCode)
            {
                var unread = await JsonSerializer.DeserializeAsync<UnreadDto>(await unreadResponse.Content.ReadAsStreamAsync(), JsonOptions);
                if (unread?.Count > 0)
                {
                    UnreadCount.Text = unread.Count.ToString();
                    UnreadBadge.Visibility = Visibility.Visible;
                }
            }
        }
        catch { /* Ошибка профиля не должна блокировать главный экран. */ }
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
        if (string.IsNullOrWhiteSpace(_token))
        {
            CreateError.Text = "Сначала настройте токен авторизации Vector.";
            return;
        }

        SubmitCreateProject.IsEnabled = false;
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"{_apiBase.TrimEnd('/')}/api/projects")
            {
                Content = new StringContent(JsonSerializer.Serialize(new
                {
                    title,
                    description = string.IsNullOrWhiteSpace(NewProjectDescription.Text) ? null : NewProjectDescription.Text.Trim()
                }), Encoding.UTF8, "application/json")
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
            using var response = await Http.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                var message = "Не удалось создать проект.";
                try { message = JsonDocument.Parse(body).RootElement.GetProperty("message").GetString() ?? message; } catch { }
                throw new InvalidOperationException(message);
            }
            CreateOverlay.Visibility = Visibility.Collapsed;
            await LoadProjectsAsync();
        }
        catch (Exception ex) { CreateError.Text = ex.Message; }
        finally { SubmitCreateProject.IsEnabled = true; }
    }

    private void NavigationButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: string pageName } && pageName != "Active")
            StatusMessage.Text = $"Раздел «{pageName}» будет перенесён отдельным этапом.";
    }

    private void ProfileButton_Click(object sender, RoutedEventArgs e)
    {
        MessageBox.Show("Настройки профиля будут перенесены отдельным этапом.", "Vector",
            MessageBoxButton.OK, MessageBoxImage.Information);
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

        public string Title { get; }
        public string Description { get; }
        public string Initial { get; }
        public string CreatedLabel { get; }
        public Brush CoverBrush { get; }
        public ImageSource? Avatar { get; }

        public ProjectCard(ProjectDto project, string apiBase)
        {
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