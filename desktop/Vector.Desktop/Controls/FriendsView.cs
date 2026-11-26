using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Vector.Desktop.Services;

namespace Vector.Desktop.Controls;
internal sealed class FriendsView : SectionView
{
    private JsonElement[] _rows=[];
    private readonly TextBox _identifier=Input("Email или имя пользователя"), _search=Input("Поиск");
    private readonly StackPanel _friends=new(),_incoming=new(),_outgoing=new();
    private readonly TextBlock _heading=Text("Мои друзья",17,true),_inHeading=Text("Входящие заявки",17,true),_outHeading=Text("Отправленные",17,true);
    internal FriendsView(VectorApi api,Func<Task> logout):base(api,logout)
    {
        var add=new DockPanel{MaxWidth=720,HorizontalAlignment=HorizontalAlignment.Left,Width=720,Margin=new Thickness(0,0,0,20)};
        var send=Button("Добавить в друзья",()=>Run(async()=>{var identifier=_identifier.Text.Trim();if(identifier.Length==0)return;await Post("/api/friends/requests",new{identifier});_identifier.Clear();await Load();Notice.Text="Заявка отправлена";Notice.SetResourceReference(TextBlock.ForegroundProperty,"Brush.Text");Notice.Visibility=Visibility.Visible;}),true);
        send.IsEnabled=false;_identifier.TextChanged+=(_,_)=>send.IsEnabled=!string.IsNullOrWhiteSpace(_identifier.Text);
        send.Margin=new Thickness(12,0,0,0);DockPanel.SetDock(send,Dock.Right);add.Children.Add(send);add.Children.Add(_identifier);Body.Children.Add(add);
        var grid=new Grid();grid.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(3,GridUnitType.Star)});grid.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(24)});grid.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(2,GridUnitType.Star)});
        var left=new StackPanel();var head=new DockPanel{Margin=new Thickness(0,0,0,14)};
        _search.Width=160;_search.Margin=new Thickness(12,0,0,0);DockPanel.SetDock(_search,Dock.Right);head.Children.Add(_search);head.Children.Add(_heading);left.Children.Add(head);left.Children.Add(_friends);
        var right=new StackPanel();Grid.SetColumn(right,2);
        foreach(var pair in new[]{(_inHeading,_incoming),(_outHeading,_outgoing)})
        {var panel=new StackPanel();pair.Item1.Margin=new Thickness(0,0,0,14);panel.Children.Add(pair.Item1);panel.Children.Add(pair.Item2);right.Children.Add(FriendPanel(panel));}
        grid.Children.Add(FriendPanel(left));grid.Children.Add(right);Body.Children.Add(grid);
        _search.TextChanged+=(_,_)=>Render();Loaded+=async(_,_)=>await Run(Load);
    }
    private static Border FriendPanel(UIElement child){var p=Panel(child);p.Padding=new Thickness(22,20,22,20);p.Margin=new Thickness(0,0,0,24);p.VerticalAlignment=VerticalAlignment.Top;return p;}
    private async Task Load(){_rows=A(await Get("/api/friends")).ToArray();Render();}
    private Task Act(string path,bool accept=false)=>Run(async()=>{if(accept)await Post(path+"/accept");else await Delete(path);await Load();});
    private Border Person(JsonElement r,bool last,params Button[] actions)
    {
        var dock=new DockPanel();
        var buttons=new WrapPanel{VerticalAlignment=VerticalAlignment.Center};foreach(var b in actions){b.Margin=new Thickness(8,0,0,0);buttons.Children.Add(b);}
        DockPanel.SetDock(buttons,Dock.Right);dock.Children.Add(buttons);
        var avatar=PersonAvatar(r);DockPanel.SetDock(avatar,Dock.Left);dock.Children.Add(avatar);
        var labels=new StackPanel{VerticalAlignment=VerticalAlignment.Center};labels.Children.Add(Text(S(r,"username"),16,true));labels.Children.Add(Muted(S(r,"email")));dock.Children.Add(labels);
        var row=new Border{Child=dock,Padding=new Thickness(0,10,0,10),BorderThickness=new Thickness(0,0,0,last?0:1)};row.SetResourceReference(Border.BorderBrushProperty,"Brush.Border");return row;
    }
    private void Render()
    {
        _friends.Children.Clear();_incoming.Children.Clear();_outgoing.Children.Clear();
        var accepted=_rows.Where(r=>S(r,"status")=="ACCEPTED"&&(S(r,"username")+" "+S(r,"email")).Contains(_search.Text.Trim(),StringComparison.CurrentCultureIgnoreCase)).ToArray();
        _heading.Text="Мои друзья ("+accepted.Length+")";
        for(int i=0;i<accepted.Length;i++){var r=accepted[i];var remove=Button("Удалить",async()=>{if(MessageBox.Show("Удалить "+S(r,"username")+" из друзей?","Vector",MessageBoxButton.YesNo)==MessageBoxResult.Yes)await Act("/api/friends/"+N(r,"id"));});remove.Background=Brushes.Transparent;remove.SetResourceReference(ForegroundProperty,"Brush.Danger");remove.SetResourceReference(BorderBrushProperty,"Brush.Danger");remove.Padding=new Thickness(14,6,14,6);_friends.Children.Add(Person(r,i==accepted.Length-1,remove));}
        if(accepted.Length==0)_friends.Children.Add(Muted(string.IsNullOrWhiteSpace(_search.Text)?"Пока никого. Добавьте друга по email или имени.":"Никого не нашлось."));
        foreach(var incoming in new[]{true,false})
        {
            var group=incoming?_incoming:_outgoing;var heading=incoming?_inHeading:_outHeading;
            var rows=_rows.Where(r=>S(r,"status")=="PENDING"&&S(r,"direction")== (incoming?"INCOMING":"OUTGOING")).ToArray();
            heading.Text=(incoming?"Входящие заявки":"Отправленные")+(rows.Length>0?" ("+rows.Length+")":"");
            for(int i=0;i<rows.Length;i++){var r=rows[i];string path="/api/friends/"+N(r,"id");group.Children.Add(incoming?Person(r,i==rows.Length-1,Button("Принять",()=>Act(path,true),true),Button("Отклонить",()=>Act(path))):Person(r,i==rows.Length-1,Button("Отменить",()=>Act(path))));}
            if(rows.Length==0)group.Children.Add(Muted(incoming?"Новых заявок нет.":"Нет ожидающих ответа."));
        }
    }
}
