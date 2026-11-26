using System.Globalization;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Vector.Desktop.Services;

namespace Vector.Desktop.Controls;

// Первый этап изолированного экрана: дерево RoadMap, участники и создание задач.
internal sealed class ProjectView : SectionView
{
    private readonly int _id;
    private readonly Action _back;
    private readonly int? _initial;
    private JsonElement _project;
    private JsonElement[] _roots=[], _members=[];
    private JsonElement _current;
    private readonly StackPanel _content=new();
    private bool Can(string right)=>A(P(_project,"permissions")).Any(p=>p.GetString()==right||p.GetString()=="ADMIN");
    internal ProjectView(VectorApi api,Func<Task> logout,int id,int? initial,Action back):base(api,logout)
    {
        _id=id;_initial=initial;_back=back;
        Body.Children.Add(_content);
        Loaded+=async(_,_)=>await Run(async()=>await Load(_initial));
    }
    private async Task Load(int? selected)
    {
        _project=await Get($"/api/projects/{_id}");
        _roots=A(await Get($"/api/tasks/projects/{_id}/tree")).ToArray();
        _members=A(await Get($"/api/projects/{_id}/participants")).ToArray();
        _current=selected.HasValue?Find(_roots,selected.Value):default;
        if(_current.ValueKind==JsonValueKind.Undefined)_current=_roots.FirstOrDefault();
        Render();
    }
    private static JsonElement Find(IEnumerable<JsonElement> nodes,int id)
    {
        foreach(var node in nodes){if(N(node,"id")==id)return node;var found=Find(A(P(node,"children")),id);if(found.ValueKind!=JsonValueKind.Undefined)return found;}return default;
    }
    private void Render()
    {
        _content.Children.Clear();
        var shell=new Grid();shell.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(56)});shell.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(1,GridUnitType.Star)});
        var rail=new StackPanel();var railBox=new Border{Child=rail,Padding=new Thickness(5),MinHeight=480};railBox.SetResourceReference(Border.BackgroundProperty,"Brush.Sidebar");
        rail.Children.Add(Button("‹",()=>{_back();return Task.CompletedTask;}));
        rail.Children.Add(Button("♙",()=>Run(Members)));
        foreach(var m in _members){var name=S(m,"username");var avatar=new Border{Width=30,Height=30,CornerRadius=new CornerRadius(15),Margin=new Thickness(0,5,0,5),ToolTip=name};avatar.SetResourceReference(Border.BackgroundProperty,"Brush.Accent");avatar.Child=new TextBlock{Text=name.Length>0?name[..1].ToUpperInvariant():"?",Foreground=Brushes.White,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center};rail.Children.Add(avatar);}
        if(Can("ADMIN"))rail.Children.Add(Button("♙+",()=>Run(Invite)));
        if(Can("EXECUTE")||Can("WRITE"))rail.Children.Add(Button("+",()=>Run(Create),true));
        rail.Children.Add(Button("⚙",()=>Run(Info)));
        shell.Children.Add(railBox);
        var main=new StackPanel{Margin=new Thickness(16,0,0,0)};Grid.SetColumn(main,1);shell.Children.Add(main);
        main.Children.Add(Row("Проекты / "+S(_project,"title")+(S(_current,"title")==S(_project,"title")?"":" / "+S(_current,"title")),"",Button("К проектам",()=>{_back();return Task.CompletedTask;})));
        if(_roots.Length==0){main.Children.Add(Panel(Text("Этап не найден",20,true)));_content.Children.Add(shell);return;}
        var rootButton=Button("Главная RoadMap",()=>{_current=_roots[0];Render();return Task.CompletedTask;});rootButton.HorizontalAlignment=HorizontalAlignment.Left;main.Children.Add(rootButton);
        var tree=new StackPanel();tree.Children.Add(Text(S(_current,"title"),24,true));
        var children=A(P(_current,"children")).ToArray();
        if(S(_current,"type")=="TODO"){tree.Children.Add(Text("ToDo: доска Kanban переносится отдельным этапом.",14));}
        if(children.Length==0)tree.Children.Add(Text("Нет вложенных этапов",14));
        foreach(var t in children)
        {
            var node=t;
            tree.Children.Add(Row(S(t,"title"),S(t,"type")+" · "+Date(S(t,"start_date"))+" — "+Date(S(t,"end_date")),Button("Открыть",()=>{_current=node;Render();return Task.CompletedTask;})));
            var track=new Grid{Height=24,Margin=new Thickness(0,0,0,10)};
            track.SetResourceReference(System.Windows.Controls.Panel.BackgroundProperty,"Brush.Surface2");
            if(DateTime.TryParse(S(_current,"start_date"),out var start)&&DateTime.TryParse(S(_current,"end_date"),out var end)&&DateTime.TryParse(S(t,"start_date"),out var a)&&DateTime.TryParse(S(t,"end_date"),out var b)&&end>start)
            {
                double left=Math.Clamp((a-start).TotalDays/(end-start).TotalDays,0,1),right=Math.Clamp((b-start).TotalDays/(end-start).TotalDays,left,1);
                track.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(left,GridUnitType.Star)});
                track.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(Math.Max(.005,right-left),GridUnitType.Star)});
                track.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(1-right,GridUnitType.Star)});
                var clip=new Border{CornerRadius=new CornerRadius(4),ToolTip=S(t,"title")};
                clip.Background=new SolidColorBrush(S(t,"type")=="TODO"?Color.FromRgb(200,148,58):Color.FromRgb(155,28,28));Grid.SetColumn(clip,1);track.Children.Add(clip);
            }
            tree.Children.Add(track);
        }
        main.Children.Add(Panel(tree));_content.Children.Add(shell);
    }
    private static string Date(string s)=>DateTime.TryParse(s,out var d)?d.ToString("dd.MM.yyyy"):"—";
    private Task Members(){var p=new StackPanel{Margin=new Thickness(24)};foreach(var m in _members)p.Children.Add(Text(S(m,"username")+" · "+string.Join(", ",A(P(m,"roles")).Select(r=>S(r,"name")))));Dialog("Участники",p,null);return Task.CompletedTask;}
    private Task Info(){var p=new StackPanel{Margin=new Thickness(24)};p.Children.Add(Text(S(_project,"title"),24,true));p.Children.Add(Text(S(_project,"description")));Dialog("О проекте",p,null);return Task.CompletedTask;}
    private async Task Invite()
    {
        var p=new StackPanel{Margin=new Thickness(24)};p.Children.Add(Text("Email или имя пользователя"));var input=Input("Email или имя пользователя");p.Children.Add(input);
        if(Dialog("Пригласить участника",p,()=>input.Text.Trim().Length>0)){await Post($"/api/projects/{_id}/invitations",new{identifier=input.Text.Trim()});await Load(N(_current,"id"));}
    }
    private async Task Create()
    {
        if(S(_current,"type")!="ROADMAP"){MessageBox.Show("Выберите этап RoadMap.");return;}
        var p=new StackPanel{Margin=new Thickness(24)};var kind=new ComboBox();if(Can("EXECUTE"))kind.Items.Add("ROADMAP");if(Can("WRITE"))kind.Items.Add("TODO");kind.SelectedIndex=0;
        var title=Input("Название");title.MaxLength=200;var start=new DatePicker{SelectedDate=DateTime.Today};var end=new DatePicker{SelectedDate=DateTime.Today.AddDays(13)};
        foreach(var pair in new (string,UIElement)[]{("Тип",kind),("Название",title),("Начало",start),("Окончание",end)}){p.Children.Add(Text(pair.Item1,14,true));p.Children.Add(pair.Item2);}
        if(!Dialog("Новая задача",p,()=>title.Text.Trim().Length>0&&start.SelectedDate.HasValue&&end.SelectedDate.HasValue&&start.SelectedDate<=end.SelectedDate))return;
        int parent=N(_current,"id");var body=new{title=title.Text.Trim(),parentRoadmapId=parent,startDate=start.SelectedDate!.Value.ToString("yyyy-MM-dd")+"T00:00:00.000Z",endDate=end.SelectedDate!.Value.ToString("yyyy-MM-dd")+"T23:59:59.999Z"};
        await Post($"/api/tasks/projects/{_id}/"+(Equals(kind.SelectedItem,"ROADMAP")?"roadmap":"todo"),body);await Load(parent);
    }
    private bool Dialog(string title,StackPanel panel,Func<bool>? validate)
    {
        var w=new Window{Title=title,Width=460,SizeToContent=SizeToContent.Height,WindowStartupLocation=WindowStartupLocation.CenterOwner,Owner=Window.GetWindow(this),Content=panel};
        w.SetResourceReference(Window.BackgroundProperty,"Brush.Background");
        var b=Button(validate==null?"Закрыть":"Сохранить",()=>{if(validate==null||validate())w.DialogResult=true;else MessageBox.Show("Проверьте заполнение полей.");return Task.CompletedTask;},true);b.Margin=new Thickness(0,16,0,0);panel.Children.Add(b);return w.ShowDialog()==true;
    }
}
