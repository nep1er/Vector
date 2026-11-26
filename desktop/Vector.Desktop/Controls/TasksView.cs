using System.Globalization;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using Vector.Desktop.Services;

namespace Vector.Desktop.Controls;
internal sealed class TasksView : SectionView
{
    private JsonElement[] _groups=[];
    private bool _mine;
    private string? _bucket;
    private readonly StackPanel _list=new();
    private readonly StackPanel _summary=new(){Orientation=Orientation.Horizontal,Margin=new Thickness(0,0,0,24)};
    private readonly Action<int,int?> _open;
    private static readonly (string Key,string Title,string Hint)[] Buckets=[("overdue","Просрочено","срок вышел, задача не закрыта"),("soon","Скоро срок","закончатся в ближайшие 3 дня"),("current","В работе","срок ещё не близко")];
    internal TasksView(VectorApi api,Func<Task> logout,Action<int,int?> open):base(api,logout)
    {
        _open=open;
        var bar=new WrapPanel{Margin=new Thickness(0,0,0,16)};
        bar.Children.Add(Button("Все доступные",()=>{_mine=false;Render();return Task.CompletedTask;}));
        bar.Children.Add(Button("Мои и для моей роли",()=>{_mine=true;Render();return Task.CompletedTask;}));
        Body.Children.Add(bar);Body.Children.Add(_summary);Body.Children.Add(_list);
        Loaded+=async(_,_)=>await Run(async()=>{_groups=A(await Get("/api/my-tasks")).ToArray();Render();});
    }
    private bool Matches(JsonElement t)=>!_mine||B(t,"mine")||B(t,"targeted");
    private void Render()
    {
        _summary.Children.Clear();_list.Children.Clear();
        var all=_groups.SelectMany(g=>A(P(g,"items"))).Where(Matches).ToArray();
        foreach(var b in Buckets)
        {
            var button=Button(all.Count(t=>S(t,"bucket")==b.Key)+"  "+b.Title+"\n"+b.Hint,()=>{_bucket=_bucket==b.Key?null:b.Key;Render();return Task.CompletedTask;},_bucket==b.Key);
            button.MinHeight=76;button.Margin=new Thickness(0,0,12,0);_summary.Children.Add(button);
        }
        foreach(var g in _groups)
        {
            var project=P(g,"project");int pid=N(project,"id");
            var items=A(P(g,"items")).Where(t=>Matches(t)&&(_bucket==null||S(t,"bucket")==_bucket)).ToArray();
            if(items.Length==0)continue;
            var group=new StackPanel();group.Children.Add(Row(S(project,"title")+"  ·  "+items.Length,"",Button("Открыть проект",()=>{_open(pid,null);return Task.CompletedTask;})));
            foreach(var b in Buckets)
            {
                var rows=items.Where(t=>S(t,"bucket")==b.Key).OrderBy(t=>B(t,"mine")?0:B(t,"targeted")?1:2).ToArray();
                if(rows.Length==0)continue;group.Children.Add(Text(b.Title.ToUpperInvariant(),14,true));
                foreach(var t in rows)
                {
                    int task=S(t,"kind")=="card"?N(t,"task_id"):N(t,"id");
                    string due=DateTime.TryParse(S(t,"due_date"),out var d)?d.ToLocalTime().ToString("d MMM",CultureInfo.GetCultureInfo("ru-RU")):"без срока";
                    string kind=S(t,"type") switch{"ROADMAP"=>"RoadMap","TODO"=>"ToDo",_=>"Карточка"};
                    group.Children.Add(Row(S(t,"title"),kind+" · "+(B(t,"mine")?"Вы исполнитель · ":B(t,"targeted")?"Ваша роль · ":"")+due,Button("›",()=>{_open(pid,task);return Task.CompletedTask;})));
                }
            }
            _list.Children.Add(Panel(group));
        }
        if(_list.Children.Count==0)_list.Children.Add(Panel(Text("Задач нет",20,true)));
    }
}
