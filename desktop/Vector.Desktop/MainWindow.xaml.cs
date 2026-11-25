using System.Windows;
using System.Windows.Controls;

namespace Vector.Desktop;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private void NavigationButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: string pageName })
        {
            return;
        }

        PageTitle.Text = pageName;
        PageDescription.Text = $"Раздел «{pageName}» — экран будет перенесён на следующем этапе.";
    }
}
