$files = @(
    'index.html',
    'js/app.js',
    'js/config.js',
    'js/storage.js',
    'js/audio.js',
    'js/multiplayer-adapter.js',
    'js/skater.js',
    'js/graffiti.js',
    'js/cursors.js',
    'js/renderer.js',
    'js/menu.js',
    'js/lobby.js',
    'js/scenes.js',
    'js/settings.js',
    'js/customization.js',
    'css/style.css',
    'css/menu.css',
    'css/lobby.css',
    'css/settings.css',
    'css/customization.css',
    'css/racing.css',
    'js/physics.js',
    'js/obstacles.js',
    'js/surprise-events.js',
    'js/collectibles.js',
    'js/scoring.js',
    'js/recovery-manager.js',
    'js/leaderboard.js',
    'js/racing-network.js',
    'js/racing.js'
)

$allPassed = $true
foreach ($file in $files) {
    try {
        $res = Invoke-WebRequest -Uri "http://localhost:8080/$file" -UseBasicParsing -TimeoutSec 5
        if ($res.StatusCode -eq 200) {
            Write-Host "[OK] $file ($($res.RawContentLength) bytes)" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] $file status: $($res.StatusCode)" -ForegroundColor Red
            $allPassed = $false
        }
    } catch {
        Write-Host "[ERROR] $file : $_" -ForegroundColor Red
        $allPassed = $false
    }
}

if ($allPassed) {
    Write-Host "`nALL 20 STATIC ASSETS VERIFIED WITH HTTP 200 OK!" -ForegroundColor Cyan
}
