using System.Net.Http;
using System.Windows;
using Vector.Desktop.Services;

namespace Vector.Desktop;

public partial class AuthWindow : Window
{
    private readonly VectorApi _api;
    private bool _register;
    internal AuthWindow(VectorApi api)
    {
        _api = api;
        InitializeComponent();
        Loaded += (_, _) => EmailInput.Focus();
    }
    private void Switch_Click(object sender, RoutedEventArgs e)
    {
        _register = !_register;
        Heading.Text = _register ? "Создание аккаунта" : "Вход в Vector";
        UsernameField.Visibility = _register ? Visibility.Visible : Visibility.Collapsed;
        SubmitButton.Content = _register ? "Зарегистрироваться" : "Войти";
        SwitchButton.Content = _register ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться";
        ErrorText.Visibility = Visibility.Collapsed;
    }
    private async void Submit_Click(object sender, RoutedEventArgs e)
    {
        var email = EmailInput.Text.Trim();
        var password = PasswordInput.Password;
        var username = UsernameInput.Text.Trim();
        if (email.Length == 0 || password.Length == 0) { ShowError("Введите email и пароль"); return; }
        if (_register && username.Length == 0) { ShowError("Введите имя пользователя"); return; }
        if (_register && password.Length < 6) { ShowError("Пароль должен быть не короче 6 символов"); return; }
        SubmitButton.IsEnabled = SwitchButton.IsEnabled = false;
        ErrorText.Visibility = Visibility.Collapsed;
        try
        {
            object body = _register ? (object)new { username, email, password } : new { email, password };
            var result = await _api.RequestAsync<AuthResponse>(HttpMethod.Post, _register ? "/api/auth/register" : "/api/auth/login", body, false);
            if (string.IsNullOrWhiteSpace(result.Token)) throw new InvalidOperationException("Сервер не вернул токен.");
            _api.Token = result.Token;
            await _api.RequestAsync<System.Text.Json.JsonElement>(HttpMethod.Get, "/api/auth/me");
            SessionStore.Save(result.Token);
            PasswordInput.Clear();
            DialogResult = true;
        }
        catch (Exception ex) { _api.Token = null; ShowError(ex.Message); }
        finally { SubmitButton.IsEnabled = SwitchButton.IsEnabled = true; }
    }
    private void ShowError(string message) { ErrorText.Text = message; ErrorText.Visibility = Visibility.Visible; }
    private sealed class AuthResponse { public string Token { get; set; } = ""; }
}
