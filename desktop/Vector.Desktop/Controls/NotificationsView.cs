using System.Globalization;
using System.Net.Http;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using Vector.Desktop.Services;

namespace Vector.Desktop.Controls;
internal sealed class NotificationsView : SectionView
{
    private string _folder="main";
    private readonly Func<Task> _refresh;
    private readonly StackPanel _list=new();
    private readonly Button _main,_hidden;
    internal NotificationsView(VectorApi api,Func<Task> logout,Func<Task> refresh):base(api,logout)
    {
        _refresh=refresh;
        var bar=new WrapPanel{Margin=new Thickness(0,0,0,16)};
        _main=Button("Основные",()=>Select("main"),true);_hidden=Button("Скрытые",()=>Select("hidden"));
        bar.Children.Add(_main);bar.Children.Add(_hidden);
        bar.Children.Add(Button("Прочитать все",()=>Act(()=>Post("/api/notifications/read-all?folder="+_folder))));
        bar.Children.Add(Button("Настройки",()=>Run(Settings)));
        Body.Children.Add(bar);Body.Children.Add(_list);
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
            b.SetResourceReference(BackgroundProperty,selected?"Brush.Accent":"Brush.Surface");
            if(selected)b.Foreground=System.Windows.Media.Brushes.White;else b.SetResourceReference(ForegroundProperty,"Brush.Text");
        }
        _list.Children.Clear();
        if(rows.Length==0){_list.Children.Add(Panel(Text(_folder=="main"?"Нет уведомлений":"В скрытых пусто",20,true)));return;}
        var urgent=rows.Where(Actionable).ToArray();
        if(urgent.Length>0){_list.Children.Add(Text("Требуют ответа",20,true));foreach(var n in urgent)Add(n);}
        foreach(var group in rows.Where(n=>!Actionable(n)).GroupBy(n=>Day(S(n,"created_at"))))
        { _list.Children.Add(Text(group.Key,18,true));foreach(var n in group)Add(n); }
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
        if(!B(n,"is_read"))actions.Add(Button("✓",()=>Act(()=>Read(id))));
        actions.Add(Button("×",()=>Act(()=>Delete($"/api/notifications/{id}"))));
        string time=DateTime.TryParse(S(n,"created_at"),out var date)?date.ToLocalTime().ToString("dd.MM.yyyy HH:mm"):"";
        var box=Panel(Row((B(n,"is_read")?"":"● ")+Describe(n),time,actions.ToArray()));if(!B(n,"is_read"))box.SetResourceReference(Border.BorderBrushProperty,"Brush.Accent");_list.Children.Add(box);
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
