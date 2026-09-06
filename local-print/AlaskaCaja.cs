using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Alaska Caja")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]

internal static class Program {
    internal static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
    internal static readonly string Data = Path.Combine(Root, "data");
    [STAThread] static void Main(string[] args) {
        bool first;
        using (var singleton = new Mutex(true, @"Local\AlaskerpPrint.Desktop", out first)) {
            if (!first) {
                try { using(var signal = EventWaitHandle.OpenExisting(@"Local\AlaskerpPrint.Show")) signal.Set(); } catch { }
                return;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new CajaForm(Array.IndexOf(args, "--background") >= 0));
        }
    }
}

internal sealed class CajaForm : Form {
    readonly Label status = new Label();
    readonly Button open = new Button();
    readonly NotifyIcon tray = new NotifyIcon();
    readonly System.Windows.Forms.Timer monitor = new System.Windows.Forms.Timer();
    readonly EventWaitHandle showSignal = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\AlaskerpPrint.Show");
    RegisteredWaitHandle showRegistration;
    Process worker;
    bool checking, closing, opening;
    int failures;
    readonly string python = Path.Combine(Program.Root, "runtime", "python.exe");
    readonly string bridge = Path.Combine(Program.Root, "bridge.py");

    public CajaForm(bool background) {
        Text = "Alaska Caja";
        ClientSize = new Size(500, 350); MinimumSize = new Size(480, 350);
        StartPosition = FormStartPosition.CenterScreen; BackColor = Color.FromArgb(255,250,242);
        Font = new Font("Segoe UI", 11);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        var title = new Label { Text = "alaska", Font = new Font("Segoe UI", 30, FontStyle.Bold), ForeColor = Color.FromArgb(233,22,123), AutoSize = true, Location = new Point(26,15) };
        var hint = new Label { Text = "Caja e impresora SAT15TUS", AutoSize = true, Location = new Point(30,80) };
        open.Text = "ABRIR CAJÓN"; open.Font = new Font("Segoe UI", 20, FontStyle.Bold);
        open.Location = new Point(28,120); open.Size = new Size(444,92);
        open.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        open.BackColor = Color.FromArgb(233,22,123); open.ForeColor = Color.White; open.FlatStyle = FlatStyle.Flat;
        open.Click += async (sender,e) => await OpenDrawer();
        status.Location = new Point(28,224); status.Size = new Size(444,55); status.Text = "Iniciando conector…";
        status.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        var copy = new Button { Text = "Copiar clave para la web", Location = new Point(28,287), Size = new Size(232,40) };
        copy.Click += (sender,e) => CopyToken();
        var minimize = new Button { Text = "Minimizar", Location = new Point(276,287), Size = new Size(196,40) };
        minimize.Click += (sender,e) => WindowState = FormWindowState.Minimized;
        Controls.AddRange(new Control[] { title,hint,open,status,copy,minimize });
        var menu = new ContextMenuStrip();
        menu.Items.Add("Mostrar Alaska Caja", null, (sender,e) => ShowPanel());
        menu.Items.Add("Abrir cajón", null, async (sender,e) => await OpenDrawer());
        menu.Items.Add("Copiar clave para la web", null, (sender,e) => CopyToken());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Salir del conector", null, (sender,e) => { closing=true; Close(); });
        tray.Icon = Icon; tray.Text = "Alaska Caja · SAT15TUS"; tray.Visible = true; tray.ContextMenuStrip = menu;
        tray.DoubleClick += (sender,e) => ShowPanel();
        FormClosing += (sender,e) => { if (!closing && e.CloseReason == CloseReason.UserClosing) { e.Cancel=true; WindowState=FormWindowState.Minimized; } };
        FormClosed += (sender,e) => { closing=true; monitor.Stop(); StopWorker(); tray.Dispose(); if(showRegistration!=null) showRegistration.Unregister(null); showSignal.Dispose(); };
        Shown += async (sender,e) => {
            showRegistration = ThreadPool.RegisterWaitForSingleObject(showSignal, (state,timedOut) => {
                if(!closing && IsHandleCreated) try { BeginInvoke((Action)ShowPanel); } catch(InvalidOperationException) { }
            }, null, Timeout.Infinite, false);
            await CheckWorker();
        };
        monitor.Interval=5000; monitor.Tick += async (sender,e) => await CheckWorker(); monitor.Start();
        if(background) WindowState=FormWindowState.Minimized;
    }
    void ShowPanel() { Show(); WindowState=FormWindowState.Normal; Activate(); }
    void CopyToken() {
        try { Clipboard.SetText(File.ReadAllText(Path.Combine(Program.Data,"token.txt")).Trim()); status.Text="Clave copiada. Pégala en Tiquetes e impresora del POS."; }
        catch { status.Text="La clave aún no está disponible. Espera al inicio del conector."; }
    }
    ProcessStartInfo StartInfo(string extra) {
        return new ProcessStartInfo(python, "\""+bridge+"\" --data-dir \""+Program.Data+"\" "+extra) {
            WorkingDirectory=Program.Root, UseShellExecute=false, CreateNoWindow=true,
            WindowStyle=ProcessWindowStyle.Hidden, RedirectStandardOutput=true, RedirectStandardError=true
        };
    }
    void StartWorker() {
        worker=new Process { StartInfo=StartInfo("") };
        // Drain streams so a noisy error cannot fill a pipe and freeze the child.
        worker.OutputDataReceived += (s,e) => { };
        worker.ErrorDataReceived += (s,e) => { };
        worker.Start(); worker.BeginOutputReadLine(); worker.BeginErrorReadLine();
        File.WriteAllText(Path.Combine(Program.Data,"worker.pid"),worker.Id.ToString());
    }
    void StopWorker() {
        if(worker==null) return;
        try { if(!worker.HasExited) { worker.Kill(); worker.WaitForExit(3000); } } catch { }
        worker.Dispose(); worker=null;
    }
    int Ping() {
        try {
            var request=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:19151/ping");
            request.Proxy=null; request.Timeout=2500; request.ReadWriteTimeout=2500;
            request.Headers["Origin"]="http://127.0.0.1:5173";
            request.Headers["X-Alaskerp-Print-Token"]=File.ReadAllText(Path.Combine(Program.Data,"token.txt")).Trim();
            using(var response=(HttpWebResponse)request.GetResponse()) return (int)response.StatusCode;
        } catch(WebException error) {
            if(error.Response!=null) using(var response=(HttpWebResponse)error.Response) return (int)response.StatusCode;
            return 0;
        } catch(IOException) { return 0; }
    }
    async Task CheckWorker() {
        if(checking || closing) return; checking=true;
        try {
            Directory.CreateDirectory(Program.Data);
            if(worker==null || worker.HasExited) {
                // A surviving valid worker can serve after the desktop supervisor restarts.
                var existing=await Task.Run((Func<int>)Ping);
                if(existing==200) {
                    // Reattach only to our installed runtime, never to an unrelated process.
                    try {
                        int previousId=int.Parse(File.ReadAllText(Path.Combine(Program.Data,"worker.pid")));
                        var previous=Process.GetProcessById(previousId);
                        if(String.Equals(previous.MainModule.FileName,python,StringComparison.OrdinalIgnoreCase)) worker=previous;
                        else previous.Dispose();
                    } catch { }
                    status.Text="Conector disponible para la página web."; failures=0; return;
                }
                if(existing!=0) { status.Text="El puerto está ocupado por otro conector. Cierra la versión anterior."; return; }
                StopWorker(); StartWorker(); status.Text="Iniciando conector de impresión…"; failures=0; return;
            }
            int result=await Task.Run((Func<int>)Ping);
            if(result==200) { failures=0; if(!opening) status.Text="Conector disponible. El cajón también funciona sin internet."; }
            else if(result==0 && ++failures>=3) {
                StopWorker(); StartWorker(); failures=0;
                status.Text="Conector reiniciado. Revisa el papel antes de repetir una orden pendiente.";
            } else if(result!=0) { failures=0; status.Text="Revisa la conexión: otro conector puede estar usando el puerto."; }
        } catch(Exception) { status.Text="No se pudo iniciar el conector. Se intentará nuevamente."; }
        finally { checking=false; }
    }
    async Task OpenDrawer() {
        if(opening) return; opening=true; open.Enabled=false;
        status.Text="Enviando apertura directamente a SAT15TUS…";
        try {
            int result=await Task.Run(() => {
                using(var process=new Process { StartInfo=StartInfo("--drawer") }) {
                    process.Start(); process.BeginOutputReadLine(); process.BeginErrorReadLine();
                    if(!process.WaitForExit(15000)) { try { process.Kill(); } catch { } return -1; }
                    return process.ExitCode;
                }
            });
            status.Text=result==0 ? "Orden enviada. Comprueba que el cajón se abrió." : "No se confirmó la apertura. Revisa SAT15TUS antes de repetir.";
            tray.BalloonTipTitle="Alaska Caja"; tray.BalloonTipText=status.Text; tray.ShowBalloonTip(3000);
        } catch { status.Text="No se pudo abrir el cajón. Revisa la impresora instalada."; }
        finally { opening=false; open.Enabled=true; }
    }
}
