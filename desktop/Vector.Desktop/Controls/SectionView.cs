using System.Net.Http;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Vector.Desktop.Services;

namespace Vector.Desktop.Controls;

public abstract class SectionView : UserControl
{
    internal readonly VectorApi Api;
    private readonly Func<Task> _logout;
    protected readonly StackPanel Body = new();
    protected readonly TextBlock Notice = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0,0,0,12) };
    private bool _busy;
    internal SectionView(VectorApi api, Func<Task> logout)
    {
        Api = api; _logout = logout;
        FontSize = 16;
        FontFamily = new FontFamily("Segoe UI");
        Resources.MergedDictionaries.Add(new ResourceDictionary { Source = new Uri("/Vector.Desktop;component/Resources/SectionStyles.xaml", UriKind.Relative) });
        SetResourceReference(ForegroundProperty, "Brush.Text");
        var root = new StackPanel();
        root.Children.Add(Notice); root.Children.Add(Body); Content = root;
        Notice.Visibility = Visibility.Collapsed;
    }
    protected async Task Run(Func<Task> action)
    {
        if (_busy) return;
        _busy = true; IsEnabled = false; Notice.Visibility = Visibility.Collapsed;
        try { await action(); }
        catch (ApiException ex) when (ex.Status == 401) { if (IsLoaded) await _logout(); }
        catch (Exception ex) { Notice.Text = ex.Message; Notice.Visibility = Visibility.Visible; Notice.SetResourceReference(TextBlock.ForegroundProperty, "Brush.Danger"); }
        finally { _busy = false; IsEnabled = true; }
    }
    protected Task<JsonElement> Get(string path) => Api.RequestAsync<JsonElement>(HttpMethod.Get, path);
    protected Task<JsonElement> Post(string path, object? body = null) => Api.RequestAsync<JsonElement>(HttpMethod.Post, path, body);
    protected Task<JsonElement> Delete(string path) => Api.RequestAsync<JsonElement>(HttpMethod.Delete, path);
    protected static string S(JsonElement e, string k) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k,out var v) && v.ValueKind != JsonValueKind.Null ? v.ToString() : "";
    protected static int N(JsonElement e, string k) => int.TryParse(S(e,k),out int n) ? n : 0;
    protected static bool B(JsonElement e, string k) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k,out var v) && v.ValueKind == JsonValueKind.True;
    protected static JsonElement P(JsonElement e,string k) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k,out var v) ? v : default;
    protected static IEnumerable<JsonElement> A(JsonElement e) => e.ValueKind == JsonValueKind.Array ? e.EnumerateArray().ToArray() : Array.Empty<JsonElement>();
    protected static TextBlock Text(string value, double size=16, bool bold=false)
    {
        var t = new TextBlock { Text=value, FontSize=size, FontWeight=bold?FontWeights.SemiBold:FontWeights.Normal, TextWrapping=TextWrapping.Wrap, VerticalAlignment=VerticalAlignment.Center };
        t.SetResourceReference(TextBlock.ForegroundProperty,"Brush.Text"); return t;
    }
    protected static Button Button(string text, Func<Task> action, bool primary=false)
    {
        var b=new Button { Content=text, Padding=new Thickness(16,8,16,8), Margin=new Thickness(0), Cursor=System.Windows.Input.Cursors.Hand };
        b.SetResourceReference(StyleProperty,"SectionButton");
        b.SetResourceReference(BackgroundProperty,primary?"Brush.Accent":"Brush.Surface");
        if(primary)b.Foreground=Brushes.White;else b.SetResourceReference(ForegroundProperty,"Brush.Text");
        if(primary)b.BorderBrush=Brushes.Transparent;else b.SetResourceReference(BorderBrushProperty,"Brush.BorderStrong");
        b.Click += async (_,_) => await action(); return b;
    }
    protected static Border Panel(UIElement child)
    {
        var b=new Border{Child=child,Padding=new Thickness(16),Margin=new Thickness(0,0,0,16),CornerRadius=new CornerRadius(8),BorderThickness=new Thickness(1)};
        b.SetResourceReference(Border.BackgroundProperty,"Brush.Surface");b.SetResourceReference(Border.BorderBrushProperty,"Brush.BorderStrong");return b;
    }
    protected static StackPanel Row(string title, string subtitle, params Button[] actions)
    {
        var row=new StackPanel{Margin=new Thickness(0,8,0,8)};
        var dock=new DockPanel();
        var buttons=new WrapPanel{HorizontalAlignment=HorizontalAlignment.Right};
        foreach(var b in actions)buttons.Children.Add(b);
        DockPanel.SetDock(buttons,Dock.Right);dock.Children.Add(buttons);
        var labels=new StackPanel();labels.Children.Add(Text(title,16,true));
        if(!string.IsNullOrWhiteSpace(subtitle)){var sub=Text(subtitle,14);sub.SetResourceReference(TextBlock.ForegroundProperty,"Brush.TextMuted");labels.Children.Add(sub);}
        dock.Children.Add(labels);row.Children.Add(dock);return row;
    }
    protected static TextBox Input(string tooltip)
    {
        var t=new TextBox{ToolTip=tooltip,Tag=tooltip,Padding=new Thickness(12,8,12,8),MinWidth=160,FontSize=16};
        t.SetResourceReference(StyleProperty,"SectionInput");
        t.SetResourceReference(BackgroundProperty,"Brush.Input");t.SetResourceReference(ForegroundProperty,"Brush.Text");t.SetResourceReference(BorderBrushProperty,"Brush.BorderStrong");return t;
    }
    protected static TextBlock Muted(string value,double size=16)
    {
        var t=Text(value,size);t.SetResourceReference(TextBlock.ForegroundProperty,"Brush.TextMuted");return t;
    }
    protected static Brush Paint(string hex)=>new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
    protected static void SelectButton(Button b,bool selected)
    {
        b.SetResourceReference(BackgroundProperty,selected?"Brush.Accent":"Brush.Input");
        if(selected)b.Foreground=Brushes.White;else b.SetResourceReference(ForegroundProperty,"Brush.Text");
    }
    protected static Border Chip(string value,bool accent=false)
    {
        var t=Text(value,12,true);var b=new Border{Child=t,CornerRadius=new CornerRadius(12),Padding=new Thickness(7,2,7,2),VerticalAlignment=VerticalAlignment.Center};
        b.SetResourceReference(Border.BackgroundProperty,accent?"Brush.Accent":"Brush.Hover");
        if(accent)t.Foreground=Brushes.White;else t.SetResourceReference(TextBlock.ForegroundProperty,"Brush.TextMuted");return b;
    }
    protected Border PersonAvatar(JsonElement person,double size=44)
    {
        string name=S(person,"username");var avatar=new Border{Width=size,Height=size,CornerRadius=new CornerRadius(size/2),VerticalAlignment=VerticalAlignment.Center,Margin=new Thickness(0,0,12,0)};
        avatar.SetResourceReference(Border.BackgroundProperty,"Brush.Accent");
        avatar.Child=new TextBlock{Text=name.Trim().Length>0?name.Trim()[..1].ToUpperInvariant():"?",Foreground=Brushes.White,FontSize=size*.42,FontWeight=FontWeights.SemiBold,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center};
        string path=S(person,"avatar_url");
        if(!string.IsNullOrWhiteSpace(path))
        {
            try
            {
                var uri=new Uri(new Uri(Api.BaseUrl+"/"),path);
                var image=new BitmapImage();image.BeginInit();image.UriSource=uri;image.EndInit();
                void Show(){avatar.Child=null;avatar.Background=new ImageBrush(image){Stretch=Stretch.UniformToFill};}
                if(image.IsDownloading)image.DownloadCompleted+=(_,_)=>Show();else if(image.PixelWidth>0)Show();
            }catch{}
        }
        return avatar;
    }
}
