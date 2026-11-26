using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace Vector.Desktop.Services;

// DPAPI через встроенные Windows API: токен привязан к текущему пользователю Windows.
internal static class SessionStore
{
    private static string FilePath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Vector", "session.dat");
    public static string? Load()
    {
        try { return File.Exists(FilePath) ? Encoding.UTF8.GetString(Transform(File.ReadAllBytes(FilePath), false)) : null; }
        catch { return null; }
    }
    public static void Save(string token)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        File.WriteAllBytes(FilePath, Transform(Encoding.UTF8.GetBytes(token), true));
    }
    public static void Clear() { if (File.Exists(FilePath)) File.Delete(FilePath); }

    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    private struct Blob { public int Size; public IntPtr Data; }

    [System.Runtime.InteropServices.DllImport("crypt32.dll", SetLastError = true, CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    [return: System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.Bool)]
    private static extern bool CryptProtectData(ref Blob input, string? description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out Blob output);

    [System.Runtime.InteropServices.DllImport("crypt32.dll", SetLastError = true)]
    [return: System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.Bool)]
    private static extern bool CryptUnprotectData(ref Blob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out Blob output);

    [System.Runtime.InteropServices.DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);

    private static byte[] Transform(byte[] bytes, bool protect)
    {
        var input = new Blob { Size = bytes.Length, Data = System.Runtime.InteropServices.Marshal.AllocHGlobal(bytes.Length) };
        Blob output = default;
        try
        {
            System.Runtime.InteropServices.Marshal.Copy(bytes, 0, input.Data, bytes.Length);
            bool ok = protect
                ? CryptProtectData(ref input, null, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output)
                : CryptUnprotectData(ref input, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output);
            if (!ok) throw new System.ComponentModel.Win32Exception(System.Runtime.InteropServices.Marshal.GetLastWin32Error());
            var result = new byte[output.Size];
            System.Runtime.InteropServices.Marshal.Copy(output.Data, result, 0, result.Length);
            return result;
        }
        finally
        {
            System.Runtime.InteropServices.Marshal.FreeHGlobal(input.Data);
            if (output.Data != IntPtr.Zero) LocalFree(output.Data);
        }
    }
}
