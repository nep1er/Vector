using System.Globalization;
using System.Net.Http;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Vector.Desktop.Services;

namespace Vector.Desktop.Controls;
internal sealed class NotificationsView : SectionView
{
    private string _folder="main";
    private readonly Func<Task> _refresh;
    private readonly StackPanel _list=new();
    private readonly Button _main,_hidden,_readAll;
    internal NotificationsView(VectorApi api,Func<Task> logout,Func<Task> refresh):base(api,logout)
    {
        _refresh=refresh;
        var bar=new DockPanel{Margin=new Thickness(0,0,0,20)};
        var actions=new StackPanel{Orientation=Orientation.Horizontal};DockPanel.SetDock(actions,Dock.Right);bar.Children.Add(actions);
        _readAll=Button("✓  Прочитать все",()=>Act(()=>Post("/api/notifications/read-all?folder="+_folder)));_readAll.Margin=new Thickness(0,0,10,0);actions.Children.Add(_readAll);
        actions.Children.Add(Button("⚙  Настройки",()=>Run(Settings)));
        var tabs=new StackPanel{Orientation=Orientation.Horizontal,HorizontalAlignment=HorizontalAlignment.Left};
        _main=Button("Основные",()=>Select("main"),true);_hidden=Button("Скрытые",()=>Select("hidden"));
        tabs.Children.Add(_main);tabs.Children.Add(_hidden);bar.Children.Add(tabs);
        Body.Children.Add(bar);_list.MaxWidth=1100;_list.HorizontalAlignment=HorizontalAlignment.Stretch;Body.Children.Add(_list);
        Loaded+=async(_,_)=>await Run(Load);
    }
    private Task Select(string folder)=>Run(async()=>{_folder=folder;await Load();});
    private Task Act(Func<Task<JsonElement>> fn)=>Run(async()=>{await fn();await Load();await _refresh();});
    private Task<JsonElement> Read(int id)=>Api.RequestAsync<JsonElement>(HttpMethod.Patch,$"/api/notifications/{id}/read");
    private async Task Load()
    {
        var rows=A(await Get("/api/notifications?folder="+_folder)).ToArray();
        var counts=await Get("/api/notifications/unread-count");
        _main.Content="Основные"+(N(counts,"count")>0?" · "+N(counts,"count"):"");_hidden.Content="Скрытые"+(N(counts,"hidden")>0?" · "+N(counts,"hidden"):"");
        foreach(var b in new[]{_main,_hidden})
        {
            bool selected=b==(_folder=="main"?_main:_hidden);
            b.SetResourceReference(BackgroundProperty,selected?"Brush.Accent":"Brush.Input");
            if(selected)b.Foreground=System.Windows.Media.Brushes.White;else b.SetResourceReference(ForegroundProperty,"Brush.Text");
        }
        _readAll.Visibility=rows.Any(n=>!B(n,"is_read"))?Visibility.Visible:Visibility.Collapsed;
        _list.Children.Clear();
        if(rows.Length==0){var empty=new StackPanel{Margin=new Thickness(0,32,0,32)};var title=Text(_folder=="main"?"Нет уведомлений":"В скрытых пусто",20,true);title.TextAlignment=TextAlignment.Center;empty.Children.Add(title);if(_folder=="main"){var hint=Muted("Менее важные категории можно убрать в «Скрытые» в настройках.");hint.TextAlignment=TextAlignment.Center;empty.Children.Add(hint);}_list.Children.Add(Panel(empty));return;}
        var urgent=rows.Where(Actionable).ToArray();
        if(urgent.Length>0){var head=new StackPanel{Orientation=Orientation.Horizontal,Margin=new Thickness(0,0,0,10)};head.Children.Add(Text("Требуют ответа",18,true));var chip=Chip(urgent.Length.ToString());chip.Margin=new Thickness(8,0,0,0);head.Children.Add(chip);_list.Children.Add(head);foreach(var n in urgent)Add(n);_list.Children.Add(new Border{Height=18});}
        foreach(var group in rows.Where(n=>!Actionable(n)).GroupBy(n=>Day(S(n,"created_at"))))
        { var day=Muted(group.Key.ToUpperInvariant(),13);day.FontWeight=FontWeights.SemiBold;day.Margin=new Thickness(0,8,0,8);_list.Children.Add(day);foreach(var n in group)Add(n); }
    }
    private static string Day(string iso)
    { if(!DateTime.TryParse(iso,out var d))return "";var local=d.ToLocalTime().Date;return local==DateTime.Today?"Сегодня":local==DateTime.Today.AddDays(-1)?"Вчера":local.ToString("d MMMM yyyy",CultureInfo.GetCultureInfo("ru-RU")); }
    private static bool Actionable(JsonElement n)=>S(n,"type")=="PROJECT_INVITATION"&&S(n,"invitation_status")=="PENDING"||S(n,"type")=="FRIEND_REQUEST"&&S(n,"friend_state")=="PENDING";
    private static string Describe(JsonElement n)
    {
        var p=P(n,"payload");
        return S(n,"type") switch
        {
            "PROJECT_INVITATION"=>S(p,"inviter_name")+" приглашает вас в проект «"+S(p,"project_title")+"»",
            "FRIEND_REQUEST"=>S(p,"from_username")+" хочет добавить вас в друзья",
            "FRIEND_ACCEPTED"=>S(p,"username")+" принял вашу заявку в друзья",
            "CARD_COMMENT"=>S(p,"author_name")+" прокомментировал карточку «"+S(p,"card_title")+"»",
            "TASK_STATUS_CHANGED"=>S(p,"actor_name")+" изменил статус задачи «"+S(p,"task_title")+"» на «"+S(p,"status_name")+"»",
            "EXTENSION_DISABLED"=>"Расширение «"+S(p,"extension_name")+"» отключено в проекте «"+S(p,"project_title")+"»",
            "EXTENSION_BAN"=>B(p,"banned")?"Вам закрыта публикация расширений. "+S(p,"reason"):"Ограничение на публикацию расширений снято",
            "EXTENSION_REVIEW"=>"Проверка расширения «"+S(p,"extension_name")+"»: "+S(p,"kind")+" "+S(p,"note"),
            _=>"Новое уведомление"
        };
    }
    private void Add(JsonElement n)
    {
        int id=N(n,"id");var p=P(n,"payload");var actions=new List<Button>();
        if(Actionable(n))
        {
            bool friend=S(n,"type")=="FRIEND_REQUEST";
            string path=friend?$"/api/friends/{N(p,"friend_id")}":$"/api/invitations/{N(p,"invitation_id")}";
            actions.Add(Button("Принять",()=>Act(async()=>{await Post(path+"/accept");return await Read(id);}),true));
            actions.Add(Button("Отклонить",()=>Act(async()=>{if(friend)await Delete(path);else await Post(path+"/decline");return await Read(id);})));
        }
        if(!B(n,"is_read"))actions.Add(IconAction("✓","Отметить прочитанным",()=>Act(()=>Read(id))));
        actions.Add(IconAction("×","Удалить уведомление",()=>Act(()=>Delete($"/api/notifications/{id}"))));
        string time=DateTime.TryParse(S(n,"created_at"),out var date)?date.ToLocalTime().ToString("dd.MM.yyyy HH:mm"):"";
        bool urgent=Actionable(n),unread=!B(n,"is_read");
        var dock=new DockPanel();var buttons=new StackPanel{Orientation=Orientation.Horizontal,VerticalAlignment=VerticalAlignment.Center};foreach(var action in actions){action.Margin=new Thickness(8,0,0,0);buttons.Children.Add(action);}DockPanel.SetDock(buttons,Dock.Right);dock.Children.Add(buttons);
        if(urgent){var icon=new Border{Width=40,Height=40,Margin=new Thickness(0,0,12,0),Child=new TextBlock{Text=S(n,"type")=="FRIEND_REQUEST"?"♙+":"▱",Foreground=Brushes.White,FontSize=22,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center}};icon.SetResourceReference(Border.BackgroundProperty,"Brush.Accent");DockPanel.SetDock(icon,Dock.Left);dock.Children.Add(icon);}
        var labels=new StackPanel{VerticalAlignment=VerticalAlignment.Center};labels.Children.Add(Text(Describe(n),16,urgent));
        var meta=new StackPanel{Orientation=Orientation.Horizontal};var cat=S(n,"category");var (label,color)=cat switch{"ROADMAP"=>("Изменения на доске","#4A8FD6"),"TODO"=>("Изменения в ToDo","#D9A21B"),"CARD"=>("Мои карточки","#2F9E5B"),"SYSTEM"=>("Расширения и модерация","#8A63D2"),_=>("Приглашения","")};
        if(!urgent){var category=Text(label,14,true);if(color=="")category.SetResourceReference(TextBlock.ForegroundProperty,"Brush.Accent");else category.Foreground=Paint(color);category.Margin=new Thickness(0,0,8,0);meta.Children.Add(category);}
        meta.Children.Add(Muted(time,14));labels.Children.Add(meta);dock.Children.Add(labels);
        var frame=new Border{CornerRadius=new CornerRadius(8),BorderThickness=new Thickness(1),Margin=new Thickness(0,0,0,10)};frame.SetResourceReference(Border.BorderBrushProperty,"Brush.Border");frame.SetResourceReference(Border.BackgroundProperty,unread?"Brush.Input":"Brush.Surface");
        var inner=new DockPanel();if(unread||urgent){var marker=new Border{Width=4,CornerRadius=new CornerRadius(7,0,0,7)};marker.SetResourceReference(Border.BackgroundProperty,"Brush.Accent");DockPanel.SetDock(marker,Dock.Left);inner.Children.Add(marker);}
        inner.Children.Add(new Border{Padding=urgent?new Thickness(18,16,18,16):new Thickness(16,12,16,12),Child=dock});frame.Child=inner;_list.Children.Add(frame);
    }
    private static Button IconAction(string symbol,string hint,Func<Task> action)
    {
        var b=Button(symbol,action);b.ToolTip=hint;b.Width=34;b.Height=34;b.Padding=new Thickness(0);b.BorderThickness=new Thickness(0);b.Background=Brushes.Transparent;return b;
    }
    private async Task Settings()
    {
        var data=A(await Get("/api/notifications/settings")).ToArray();
        var panel=new StackPanel{Margin=new Thickness(24)};
        panel.Children.Add(Text("Настройки уведомлений",24,true));
        var labels=new Dictionary<string,string>{{"INVITES","Приглашения"},{"ROADMAP","Изменения на доске"},{"TODO","Изменения в ToDo"},{"CARD","Мои карточки"},{"SYSTEM","Расширения и модерация"}};
        var fields=new Dictionary<string,CheckBox>();
        foreach(var row in data)
        {
            string key=S(row,"category");if(!labels.TryGetValue(key,out var label))continue;
            var check=new CheckBox{Content=label,IsChecked=B(row,"hidden"),Margin=new Thickness(0,12,0,0)};
            check.SetResourceReference(ForegroundProperty,"Brush.Text");fields[key]=check;panel.Children.Add(check);
        }
        panel.Children.Add(Text("Отметьте категории, которые нужно переместить в скрытые.",14));
        var win=new Window{Title="Vector — Уведомления",Width=480,SizeToContent=SizeToContent.Height,WindowStartupLocation=WindowStartupLocation.CenterOwner,Owner=Window.GetWindow(this),Content=panel};
        win.SetResourceReference(Window.BackgroundProperty,"Brush.Background");
        var save=Button("Сохранить",()=>{win.DialogResult=true;return Task.CompletedTask;},true);save.Margin=new Thickness(0,20,0,0);panel.Children.Add(save);
        if(win.ShowDialog()==true)
        {await Api.RequestAsync<JsonElement>(HttpMethod.Put,"/api/notifications/settings",fields.ToDictionary(k=>k.Key,k=>k.Value.IsChecked==true));await Load();await _refresh();}
    }
}
