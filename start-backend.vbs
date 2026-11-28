Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
backendDir = scriptDir & "\backend"
WshShell.CurrentDirectory = backendDir
WshShell.Run "cmd /c node server.js > """ & backendDir & "\server.log"" 2>&1", 0, False
