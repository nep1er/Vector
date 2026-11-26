using System.Globalization;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using Vector.Desktop.Services;

namespace Vector.Desktop.Controls;
internal sealed class TasksView : SectionView
{
    private JsonElement[] _groups=[];
    private bool _mine;
    private string? _bucket;
    private readonly StackPanel _list=new();
    private readonly UniformGrid _summary=new(){Columns=3,Margin=new Thickness(0,0,0,24)};
    private readonly Button _allButton,_mineButton;
    private static string BucketColor(string key)=>key switch{"overdue"=>"#E0483E","soon"=>"#D9A21B",_=>"#4A8FD6"};
    private readonly Action<int,int?> _open;
    private static readonly (string Key,string Title,string Hint)[] Buckets=[("overdue","Просрочено","срок вышел, задача не закрыта"),("soon","Скоро срок","закончатся в ближайшие 3 дня"),("current","В работе","срок ещё не близко")];
    internal TasksView(VectorApi api,Func<Task> logout,Action<int,int?> open):base(api,logout)
    {
        _open=open;
        var bar=new StackPanel{Orientation=Orientation.Horizontal,HorizontalAlignment=HorizontalAlignment.Right,Margin=new Thickness(0,0,0,16)};
        _allButton=Button("Все доступные",()=>{_mine=false;Render();return Task.CompletedTask;});
        _mineButton=Button("Мои и для моей роли",()=>{_mine=true;Render();return Task.CompletedTask;});
        bar.Children.Add(_allButton);bar.Children.Add(_mineButton);
        Body.Children.Add(bar);Body.Children.Add(_summary);Body.Children.Add(_list);
        Loaded+=async(_,_)=>await Run(async()=>{_groups=A(await Get("/api/my-tasks")).ToArray();Render();});
    }
    private bool Matches(JsonElement t)=>!_mine||B(t,"mine")||B(t,"targeted");
    private void Render()
    {
        SelectButton(_allButton,!_mine);SelectButton(_mineButton,_mine);
        _summary.Children.Clear();_list.Children.Clear();
        var all=_groups.SelectMany(g=>A(P(g,"items"))).Where(Matches).ToArray();
        foreach(var b in Buckets)
        {
            var button=Button("",()=>{_bucket=_bucket==b.Key?null:b.Key;Render();return Task.CompletedTask;});
            button.Padding=new Thickness(0);button.HorizontalContentAlignment=HorizontalAlignment.Stretch;button.Margin=new Thickness(0,0,b.Key=="current"?0:12,0);
            button.SetResourceReference(BackgroundProperty,_bucket==b.Key?"Brush.Input":"Brush.Surface");
            if(_bucket==b.Key)button.SetResourceReference(BorderBrushProperty,"Brush.Text");
            var content=new StackPanel{Margin=new Thickness(18,14,18,14)};
            content.Children.Add(Text(all.Count(t=>S(t,"bucket")==b.Key).ToString(),32,true));content.Children.Add(Text(b.Title,16,true));content.Children.Add(Muted(b.Hint,13));
            var dock=new DockPanel();var marker=new Border{Width=4,Background=Paint(BucketColor(b.Key)),CornerRadius=new CornerRadius(5,0,0,5)};DockPanel.SetDock(marker,Dock.Left);dock.Children.Add(marker);dock.Children.Add(content);button.Content=dock;
            _summary.Children.Add(button);
        }
        foreach(var g in _groups)
        {
            var project=P(g,"project");int pid=N(project,"id");
            var items=A(P(g,"items")).Where(t=>Matches(t)&&(_bucket==null||S(t,"bucket")==_bucket)).ToArray();
            if(items.Length==0)continue;
            var group=new StackPanel();
            var header=Button("",()=>{_open(pid,null);return Task.CompletedTask;});header.Padding=new Thickness(16,12,16,12);header.BorderThickness=new Thickness(0);header.HorizontalContentAlignment=HorizontalAlignment.Left;header.SetResourceReference(BackgroundProperty,"Brush.Surface2");
            var titleLine=new StackPanel{Orientation=Orientation.Horizontal};titleLine.Children.Add(Text(S(project,"title"),17,true));var count=Chip(items.Length.ToString());count.Margin=new Thickness(10,0,0,0);titleLine.Children.Add(count);header.Content=titleLine;group.Children.Add(header);
            foreach(var b in Buckets)
            {
                var rows=items.Where(t=>S(t,"bucket")==b.Key).OrderBy(t=>B(t,"mine")?0:B(t,"targeted")?1:2).ToArray();
                if(rows.Length==0)continue;
                var line=new StackPanel{Orientation=Orientation.Horizontal,Margin=new Thickness(16,12,16,6)};
                line.Children.Add(new Border{Width=10,Height=10,CornerRadius=new CornerRadius(5),Background=Paint(BucketColor(b.Key)),VerticalAlignment=VerticalAlignment.Center,Margin=new Thickness(0,0,8,0)});
                var label=Muted(b.Title.ToUpperInvariant(),13);label.FontWeight=FontWeights.Bold;line.Children.Add(label);var countChip=Chip(rows.Length.ToString());countChip.Margin=new Thickness(8,0,0,0);line.Children.Add(countChip);group.Children.Add(line);
                foreach(var t in rows)
                {
                    int task=S(t,"kind")=="card"?N(t,"task_id"):N(t,"id");
                    bool late=false;string due="без срока";
                    if(DateTimeOffset.TryParse(S(t,"due_date"),out var d)){var days=(d-DateTimeOffset.Now).TotalDays;late=days<0;due=d.ToLocalTime().ToString("d MMM",CultureInfo.GetCultureInfo("ru-RU"))+" · "+(late?$"просрочено на {Math.Max(1,(int)Math.Round(-days))} дн.":days<.5?"сегодня":$"через {(int)Math.Round(days)} дн.");}
                    string kind=S(t,"type") switch{"ROADMAP"=>"RoadMap","TODO"=>"ToDo",_=>"Карточка"};
                    var row=new Grid();foreach(var width in new[]{new GridLength(1,GridUnitType.Star),GridLength.Auto,new GridLength(116),new GridLength(205),new GridLength(20)})row.ColumnDefinitions.Add(new ColumnDefinition{Width=width});
                    void Add(UIElement el,int col){Grid.SetColumn(el,col);row.Children.Add(el);}
                    var labels=new StackPanel();labels.Children.Add(Text(S(t,"title"),16,true));labels.Children.Add(Muted(kind+(S(t,"kind")=="card"?" · "+S(t,"parent_title")+" › "+S(t,"column_title"):""),13));Add(labels,0);
                    if(B(t,"mine")||B(t,"targeted")){var who=Chip(B(t,"mine")?"Вы":"Ваша роль",B(t,"mine"));who.Margin=new Thickness(8,0,12,0);Add(who,1);}
                    var status=N(t,"status_id");if(status>0){var (name,color)=status switch{1=>("Выполнено","#2F9E5B"),2=>("В процессе","#D9A21B"),4=>("Просрочено","#E0483E"),5=>("Заморожено","#7FB7C9"),6=>("Неактивно","#8A8A8A"),_=>("В плане","#4A8FD6")};var st=new StackPanel{Orientation=Orientation.Horizontal,VerticalAlignment=VerticalAlignment.Center};st.Children.Add(new Border{Width=9,Height=9,CornerRadius=new CornerRadius(5),Background=Paint(color),Margin=new Thickness(0,0,6,0),VerticalAlignment=VerticalAlignment.Center});st.Children.Add(Text(name,13));Add(st,2);}
                    var date=Muted(due,13);date.TextAlignment=TextAlignment.Right;if(late){date.SetResourceReference(TextBlock.ForegroundProperty,"Brush.Danger");date.FontWeight=FontWeights.SemiBold;}Add(date,3);var arrow=Muted("›",22);arrow.HorizontalAlignment=HorizontalAlignment.Right;Add(arrow,4);
                    var open=Button("",()=>{_open(pid,task);return Task.CompletedTask;});open.Content=row;open.Padding=new Thickness(16,10,16,10);open.HorizontalContentAlignment=HorizontalAlignment.Stretch;open.BorderThickness=new Thickness(0);open.Background=Brushes.Transparent;
                    var divider=new Border{Child=open,BorderThickness=new Thickness(0,1,0,0)};divider.SetResourceReference(Border.BorderBrushProperty,"Brush.Border");group.Children.Add(divider);
                }
            }
            var card=Panel(group);card.Padding=new Thickness(0);card.Margin=new Thickness(0,0,0,20);_list.Children.Add(card);
        }
        if(_list.Children.Count==0){var empty=new StackPanel{Margin=new Thickness(0,32,0,32)};var title=Text("Задач нет",20,true);title.TextAlignment=TextAlignment.Center;empty.Children.Add(title);var hint=Muted("Здесь появятся карточки, где вы исполнитель, и все доступные вам задачи проектов.");hint.TextAlignment=TextAlignment.Center;empty.Children.Add(hint);_list.Children.Add(Panel(empty));}
    }
}
