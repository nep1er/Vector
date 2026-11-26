using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using Vector.Desktop.Services;

namespace Vector.Desktop.Controls;
internal sealed class FriendsView : SectionView
{
    private JsonElement[] _rows = [];
    private readonly TextBox _identifier=Input("Email или имя пользователя"), _search=Input("Поиск друзей");
    private readonly StackPanel _list=new();
    internal FriendsView(VectorApi api,Func<Task> logout):base(api,logout)
    {
        var add=new DockPanel{MaxWidth=720,HorizontalAlignment=HorizontalAlignment.Left,Margin=new Thickness(0,0,0,20)};
        var send=Button("Добавить в друзья",()=>Run(async()=>{var identifier=_identifier.Text.Trim();if(identifier.Length==0)return;await Post("/api/friends/requests",new{identifier});_identifier.Clear();await Load();}),true);
        DockPanel.SetDock(send,Dock.Right);add.Children.Add(send);add.Children.Add(_identifier);Body.Children.Add(add);
        Body.Children.Add(_list);_search.TextChanged+=(_,_)=>Render();Loaded+=async(_,_)=>await Run(Load);
    }
    private async Task Load(){_rows=A(await Get("/api/friends")).ToArray();Render();}
    private Task Act(string path,bool accept=false)=>Run(async()=>{if(accept)await Post(path+"/accept");else await Delete(path);await Load();});
    private void Render()
    {
        _list.Children.Clear();
        var grid=new Grid();grid.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(3,GridUnitType.Star)});grid.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(2,GridUnitType.Star)});
        var left=new StackPanel{Margin=new Thickness(0,0,24,0)};var right=new StackPanel();Grid.SetColumn(right,1);grid.Children.Add(left);grid.Children.Add(right);
        var friends=new StackPanel();friends.Children.Add(Text("Мои друзья",20,true));
        if(_search.Parent is Panel old)old.Children.Remove(_search);friends.Children.Add(_search);
        var accepted=_rows.Where(r=>S(r,"status")=="ACCEPTED"&&(S(r,"username")+" "+S(r,"email")).Contains(_search.Text.Trim(),StringComparison.CurrentCultureIgnoreCase)).ToArray();
        foreach(var r in accepted)friends.Children.Add(Row(S(r,"username"),S(r,"email"),Button("Удалить",async()=>{if(MessageBox.Show("Удалить из друзей?","Vector",MessageBoxButton.YesNo)==MessageBoxResult.Yes)await Act("/api/friends/"+N(r,"id"));})));
        if(accepted.Length==0)friends.Children.Add(Text("Пока никого или ничего не найдено.",14));left.Children.Add(Panel(friends));
        foreach(var incoming in new[]{true,false})
        {
            var group=new StackPanel();group.Children.Add(Text(incoming?"Входящие заявки":"Отправленные",20,true));
            var rows=_rows.Where(r=>S(r,"status")=="PENDING"&&S(r,"direction")== (incoming?"INCOMING":"OUTGOING")).ToArray();
            foreach(var r in rows){string path="/api/friends/"+N(r,"id");group.Children.Add(incoming?Row(S(r,"username"),S(r,"email"),Button("Принять",()=>Act(path,true),true),Button("Отклонить",()=>Act(path))):Row(S(r,"username"),S(r,"email"),Button("Отменить",()=>Act(path))));}
            if(rows.Length==0)group.Children.Add(Text(incoming?"Новых заявок нет.":"Нет ожидающих ответа.",14));right.Children.Add(Panel(group));
        }
        _list.Children.Add(grid);
    }
}
