using System.IO;
using System.Windows;
using System.Windows.Media;

namespace Vector.Desktop.Services;
internal static class ThemeService
{
    private static readonly string[] Keys = { "Background", "Surface", "Surface2", "Hover", "Border", "BorderStrong", "Text", "TextMuted", "Accent", "AccentHover", "Sidebar", "SidebarHover", "SidebarActive", "SidebarText", "SidebarMuted", "SidebarBorder", "Input", "Danger", "SidebarMenu" };
    private static readonly Dictionary<string, string[]> Themes = new()
    {
        ["system-light"] = new[] { "#d3b06c", "#efdfb5", "#e6d09a", "#c8a25c", "#b08a48", "#8c6b32", "#261a0c", "#4d391d", "#9b1c1c", "#b32424", "#2a1d0f", "#4d3822", "#5a4228", "#f3e8d0", "#c9b690", "#54402a", "#f7eed3", "#a31616", "#3f2d19" },
        ["system-dark"] = new[] { "#17120d", "#251e16", "#2f271d", "#3a3025", "#44382a", "#6a5a42", "#f1e8d6", "#cbbd9f", "#b83232", "#cf4242", "#100c08", "#2a2118", "#34291d", "#f3e8d0", "#a89a7c", "#2e2519", "#1d1812", "#e05a5a", "#211a11" },
        ["light"] = new[] { "#eceef1", "#ffffff", "#f3f4f6", "#e5e7eb", "#d1d5db", "#9ca3af", "#111827", "#4b5563", "#2563eb", "#1d4ed8", "#1f2937", "#374151", "#4b5563", "#f3f4f6", "#9ca3af", "#374151", "#ffffff", "#dc2626", "#2b3646" },
        ["dark"] = new[] { "#121316", "#1c1e22", "#25282d", "#2f3238", "#363a41", "#555b66", "#e5e7eb", "#b0b6c0", "#3b82f6", "#60a5fa", "#0c0d0f", "#1f2227", "#2a2d34", "#e5e7eb", "#8b93a1", "#24272c", "#16181b", "#f06262", "#181a1e" }
    };
    private static string FilePath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Vector", "theme.txt");
    public static string Current { get; private set; } = "system-light";
    public static void Load()
    {
        try { Apply(File.Exists(FilePath) ? File.ReadAllText(FilePath).Trim() : "system-light", false); }
        catch { Apply("system-light", false); }
    }
    public static void Apply(string id, bool save = true)
    {
        if (!Themes.TryGetValue(id, out var colors)) return;
        Current = id;
        for (int i = 0; i < Keys.Length; i++)
        {
            var color = (Color)ColorConverter.ConvertFromString(colors[i]);
            Application.Current.Resources["Brush." + Keys[i]] = new SolidColorBrush(color);
        }
        if (save) { try { Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!); File.WriteAllText(FilePath, id); } catch { } }
    }
}
