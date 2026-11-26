using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Vector.Desktop.Services;

namespace Vector.Desktop.Controls;

public partial class ProfileView : UserControl
{
    private readonly VectorApi _api;
    private readonly Func<Task> _refresh, _logout;
    private bool _busy;
    internal ProfileView(VectorApi api, Func<Task> refresh, Func<Task> logout)
    {
        _api = api; _refresh = refresh; _logout = logout;
        InitializeComponent();
        Loaded += async (_, _) => await RunAsync(LoadAsync, null);
    }
    private async Task LoadAsync()
    {
        var user = await _api.RequestAsync<JsonElement>(HttpMethod.Get, "/api/auth/me");
        string name = user.GetProperty("username").GetString() ?? "";
        HeroName.Text = NameValue.Text = NameInput.Text = name;
        EmailValue.Text = EmailInput.Text = user.GetProperty("email").GetString() ?? "";
        Initial.Text = name.Length > 0 ? name[..1].ToUpperInvariant() : "?";
        Avatar.Child = Initial;
        Avatar.SetResourceReference(Border.BackgroundProperty, "Brush.Accent");
        if (user.TryGetProperty("avatar_url", out var value) && value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString()))
        {
            try { var uri = new Uri(new Uri(_api.BaseUrl + "/"), value.GetString()!); var image = new BitmapImage(uri); Avatar.Child = null; Avatar.Background = new ImageBrush(image) { Stretch = Stretch.UniformToFill }; } catch { }
        }
    }
    private void Toggle_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button button) return;
        var selected = (button.Tag as string) switch { "username" => NameForm, "email" => EmailForm, "password" => PasswordForm, _ => DeleteForm };
        bool open = selected.Visibility != Visibility.Visible;
        foreach (var panel in new[] { NameForm, EmailForm, PasswordForm, DeleteForm }) panel.Visibility = Visibility.Collapsed;
        NameInput.Text = NameValue.Text; EmailInput.Text = EmailValue.Text;
        OldPassword.Clear(); NewPassword.Clear(); RepeatPassword.Clear(); DeleteInput.Clear();
        if (open) selected.Visibility = Visibility.Visible;
    }
    private async Task RunAsync(Func<Task> action, string? message)
    {
        if (_busy) return;
        _busy = true; IsEnabled = false; Notice.Visibility = Visibility.Collapsed;
        try { await action(); if (message != null) { Notice.Text = message; Notice.SetResourceReference(TextBlock.ForegroundProperty, "Brush.Text"); Notice.Visibility = Visibility.Visible; } }
        catch (ApiException ex) when (ex.Status == 401) { await _logout(); }
        catch (Exception ex) { Notice.Text = ex.Message; Notice.SetResourceReference(TextBlock.ForegroundProperty, "Brush.Danger"); Notice.Visibility = Visibility.Visible; }
        finally { _busy = false; IsEnabled = true; }
    }
    private async Task UpdateAsync(string path, object body)
    {
        await _api.RequestAsync<JsonElement>(HttpMethod.Patch, "/api/auth/profile/" + path, body);
        await LoadAsync(); await _refresh();
    }
    private async void SaveName_Click(object sender, RoutedEventArgs e) => await RunAsync(async () =>
    { var username = NameInput.Text.Trim(); if (username.Length == 0) throw new InvalidOperationException("Введите имя пользователя."); await UpdateAsync("username", new { username }); NameForm.Visibility = Visibility.Collapsed; }, "Имя пользователя сохранено");
    private async void SaveEmail_Click(object sender, RoutedEventArgs e) => await RunAsync(async () =>
    { var email = EmailInput.Text.Trim(); if (!System.Text.RegularExpressions.Regex.IsMatch(email, @"^\S+@\S+\.\S+$")) throw new InvalidOperationException("Введите корректный email."); await UpdateAsync("email", new { email }); EmailForm.Visibility = Visibility.Collapsed; }, "Email сохранён");
    private async void SavePassword_Click(object sender, RoutedEventArgs e) => await RunAsync(async () =>
    { var oldPassword = OldPassword.Password; var newPassword = NewPassword.Password; if (oldPassword.Length == 0 || newPassword.Length < 6 || newPassword != RepeatPassword.Password) throw new InvalidOperationException("Проверьте текущий пароль и совпадение новых паролей (не менее 6 символов)."); await UpdateAsync("password", new { oldPassword, newPassword }); OldPassword.Clear(); NewPassword.Clear(); RepeatPassword.Clear(); PasswordForm.Visibility = Visibility.Collapsed; }, "Пароль изменён");
    private async void RemoveAvatar_Click(object sender, RoutedEventArgs e) => await RunAsync(() => UpdateAsync("avatar", new { avatarUrl = "" }), "Фото удалено");
    private async void Upload_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new Microsoft.Win32.OpenFileDialog { Filter = "Изображения|*.png;*.jpg;*.jpeg;*.webp" };
        if (dialog.ShowDialog() != true) return;
        await RunAsync(async () =>
        {
            var info = new FileInfo(dialog.FileName);
            if (info.Length > 2 * 1024 * 1024) throw new InvalidOperationException("Выберите изображение размером до 2 МБ.");
            using var content = new ByteArrayContent(await File.ReadAllBytesAsync(dialog.FileName));
            content.Headers.ContentType = new MediaTypeHeaderValue(Path.GetExtension(dialog.FileName).ToLowerInvariant() switch { ".png" => "image/png", ".webp" => "image/webp", _ => "image/jpeg" });
            await _api.RequestAsync<JsonElement>(HttpMethod.Post, "/api/auth/profile/avatar/upload", content);
            await LoadAsync(); await _refresh();
        }, "Фото обновлено");
    }
    private async void Delete_Click(object sender, RoutedEventArgs e)
    {
        if (!string.Equals(DeleteInput.Text.Trim(), "удалить", StringComparison.OrdinalIgnoreCase)) return;
        if (MessageBox.Show("Удалить аккаунт навсегда?", "Vector", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        await RunAsync(async () => { await _api.RequestAsync<JsonElement>(HttpMethod.Delete, "/api/auth/account"); await _logout(); }, null);
    }
}
