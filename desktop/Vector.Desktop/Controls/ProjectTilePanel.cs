using System.Windows;
using System.Windows.Controls;

namespace Vector.Desktop.Controls;

// CSS grid: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px.
public sealed class ProjectTilePanel : Panel
{
    private const double Minimum = 320, Gap = 24;
    private int Columns(double width) => Math.Max(1, (int)Math.Floor((width + Gap) / (Minimum + Gap)));
    protected override Size MeasureOverride(Size availableSize)
    {
        double width = double.IsInfinity(availableSize.Width) ? Minimum : Math.Max(0, availableSize.Width);
        int columns = Columns(width);
        double tile = Math.Max(0, (width - (columns - 1) * Gap) / columns);
        double height = 0, row = 0;
        for (int i = 0; i < InternalChildren.Count; i++)
        {
            InternalChildren[i].Measure(new Size(tile, double.PositiveInfinity));
            row = Math.Max(row, InternalChildren[i].DesiredSize.Height);
            if ((i + 1) % columns == 0 || i == InternalChildren.Count - 1)
            { height += row + (i == InternalChildren.Count - 1 ? 0 : Gap); row = 0; }
        }
        return new Size(width, height);
    }
    protected override Size ArrangeOverride(Size finalSize)
    {
        int columns = Columns(finalSize.Width);
        double tile = Math.Max(0, (finalSize.Width - (columns - 1) * Gap) / columns);
        double y = 0;
        for (int start = 0; start < InternalChildren.Count; start += columns)
        {
            int end = Math.Min(start + columns, InternalChildren.Count);
            double height = 0;
            for (int i = start; i < end; i++) height = Math.Max(height, InternalChildren[i].DesiredSize.Height);
            for (int i = start; i < end; i++)
                InternalChildren[i].Arrange(new Rect((i-start)*(tile+Gap), y, tile, height));
            y += height + Gap;
        }
        return finalSize;
    }
}
