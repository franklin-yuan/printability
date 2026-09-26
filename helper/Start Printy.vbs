Option Explicit
Dim shell, fs, folder, launcher
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
launcher = "C:\Program Files\Python312\pythonw.exe"
If fs.FileExists(launcher) Then
  shell.Run Chr(34) & launcher & Chr(34) & " " & Chr(34) & folder & "\Printy.pyw" & Chr(34), 0, False
Else
  MsgBox "Open Printy.pyw with Python 3 (including tkinter). Python was not found at the configured location.", 48, "Printy"
End If
