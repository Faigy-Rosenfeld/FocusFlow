# הפעל מתיקיית הפרויקט הראשית
# יוצר את תיקיית models ומעתיק את קבצי ה-ONNX

$root = Split-Path -Parent $PSScriptRoot

# צור תיקיית models
New-Item -ItemType Directory -Force -Path "$PSScriptRoot\models" | Out-Null

# העתק מודלים
Copy-Item "$root\client\public\models\v1.onnx"   "$PSScriptRoot\models\" -Force
Copy-Item "$root\client\public\models\v4_2.onnx" "$PSScriptRoot\models\" -Force

Write-Host "Models copied successfully!" -ForegroundColor Green
Write-Host "Now load the extension in Chrome: chrome://extensions -> Load unpacked -> select the 'extension' folder"
