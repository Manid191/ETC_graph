$csvPath = "data.csv"
$jsPath = "data-store.js"

if (Test-Path $csvPath) {
    try {
        $content = Get-Content -Path $csvPath -Raw
        # Use single quotes for the JS string to avoid escaping issues with double quotes inside CSV
        # Escape any single quotes in the CSV content
        $escapedContent = $content -replace "'", "\'"
        $jsContent = "window.DEFAULT_CSV_DATA = '$($escapedContent -replace "`r`n", "\n" -replace "`n", "\n")';"
        # Note: actually using a here-string or backticks might be better but let's try a simple string first
        # Better yet: use template literals in JS
        $escapedContent = $content -replace '`', '\`' -replace '\$', '\$'
        $jsContent = "window.DEFAULT_CSV_DATA = ``$($escapedContent)``;"
        
        Set-Content -Path $jsPath -Value $jsContent -Encoding UTF8
        Write-Host "Successfully generated data-store.js"
    } catch {
        Write-Error "Error generating data-store.js: $_"
        exit 1
    }
} else {
    Write-Error "data.csv not found"
    exit 1
}
