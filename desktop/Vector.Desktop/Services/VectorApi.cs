using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Vector.Desktop.Services;

internal sealed class ApiException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

internal sealed class VectorApi
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public string BaseUrl { get; } = (Environment.GetEnvironmentVariable("VECTOR_API_URL") ?? "http://localhost:5000").TrimEnd('/');
    public string? Token { get; set; }

    public async Task<T> RequestAsync<T>(HttpMethod method, string path, object? body = null, bool authorized = true)
    {
        using var request = new HttpRequestMessage(method, BaseUrl + path);
        if (authorized && !string.IsNullOrWhiteSpace(Token))
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Token);
        if (body is not null)
            request.Content = new StringContent(JsonSerializer.Serialize(body, Json), Encoding.UTF8, "application/json");
        HttpResponseMessage response;
        try { response = await Http.SendAsync(request); }
        catch (HttpRequestException) { throw new ApiException(0, "Не удалось связаться с сервером. Проверьте, что он запущен."); }
        catch (TaskCanceledException) { throw new ApiException(0, "Сервер не ответил вовремя."); }
        using (response)
        {
            var content = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                var message = $"Ошибка сервера ({(int)response.StatusCode})";
                try { using var doc = JsonDocument.Parse(content); message = doc.RootElement.GetProperty("message").GetString() ?? message; }
                catch { }
                throw new ApiException((int)response.StatusCode, message);
            }
            return JsonSerializer.Deserialize<T>(content, Json) ?? throw new ApiException(0, "Сервер вернул пустой ответ.");
        }
    }
}
