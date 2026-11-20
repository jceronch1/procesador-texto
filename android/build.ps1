param(
    [string]$Sdk = $env:ANDROID_HOME,
    [string]$Jdk = $env:JAVA_HOME,
    [string]$BuildTools = '36.1.0',
    [string]$BundleTool,
    [string]$BundleAapt2
)

$ErrorActionPreference = 'Stop'
if (!$Sdk) { $Sdk = $env:ANDROID_SDK_ROOT }
if (!$Sdk) { $Sdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
if (!$Jdk) {
    $compiler = Get-Command javac -ErrorAction SilentlyContinue
    if ($compiler) { $Jdk = Split-Path (Split-Path $compiler.Source) }
}
if (!$Jdk) { throw 'Configura JAVA_HOME o pasa -Jdk con la ruta de un JDK 17 o posterior.' }

$project = Split-Path $PSScriptRoot
$tools = Join-Path $Sdk "build-tools/$BuildTools"
$platform = Join-Path $Sdk 'platforms/android-36/android.jar'
$java = Join-Path $Jdk 'bin/java.exe'
$javac = Join-Path $Jdk 'bin/javac.exe'
$jar = Join-Path $Jdk 'bin/jar.exe'
$keytool = Join-Path $Jdk 'bin/keytool.exe'
$requiredTools = @($platform, $java, $javac, $jar, $keytool, "$tools/lib/d8.jar")
if ($BundleTool) {
    if (!$BundleAapt2) { throw 'Pasa -BundleAapt2 con la ruta al aapt2.exe del repositorio Maven de Google.' }
    $jarsigner = Join-Path $Jdk 'bin/jarsigner.exe'
    $aapt2 = $BundleAapt2
    $requiredTools += @($BundleTool, $aapt2, $jarsigner)
} else {
    $aapt2 = "$tools/aapt2.exe"
    $requiredTools += @($aapt2, "$tools/zipalign.exe", "$tools/lib/apksigner.jar")
}
foreach ($required in $requiredTools) {
    if (!(Test-Path -LiteralPath $required -PathType Leaf)) { throw "Herramienta no encontrada: $required" }
}

function Invoke-BuildTool([string]$Tool, [string[]]$ToolArgs) {
    & $Tool @ToolArgs
    if ($LASTEXITCODE -ne 0) { throw "Falló $Tool con código $LASTEXITCODE." }
}

$buildRoot = Join-Path $PSScriptRoot '.build'
$work = Join-Path $buildRoot ([guid]::NewGuid().ToString('N'))
$signing = Join-Path $PSScriptRoot '.signing'
$dist = Join-Path $project 'dist'
New-Item -ItemType Directory -Force -Path "$work/assets","$work/classes","$work/dex",$signing,$dist | Out-Null
try {
    Copy-Item -LiteralPath "$project/index.html","$project/css","$project/js" -Destination "$work/assets" -Recurse
    # Android-specific controls are loaded after the editor and before DOMContentLoaded.
    Copy-Item -LiteralPath "$PSScriptRoot/web/android-native.js","$PSScriptRoot/web/android-mobile.js" -Destination "$work/assets/js"
    Copy-Item -LiteralPath "$PSScriptRoot/web/android-voice.js" -Destination "$work/assets/js"
    Copy-Item -LiteralPath "$PSScriptRoot/web/android-mobile.css" -Destination "$work/assets/css"
    $indexFile = "$work/assets/index.html"
    $index = [IO.File]::ReadAllText($indexFile)
    if (!$index.Contains('</head>') -or !$index.Contains('</body>')) { throw 'No se pudo localizar la estructura del editor web.' }
    $manifest = [xml][IO.File]::ReadAllText("$PSScriptRoot/AndroidManifest.xml")
    $version = $manifest.DocumentElement.GetAttribute('versionName', 'http://schemas.android.com/apk/res/android')
    $versionTag = '<meta name="android-version" content="' + [Net.WebUtility]::HtmlEncode($version) + '">'
    $index = $index.Replace('</head>', $versionTag + '<link rel="stylesheet" href="css/android-mobile.css"></head>')
    $index = $index.Replace('</body>', '<script src="js/android-native.js"></script><script src="js/android-mobile.js"></script><script src="js/android-voice.js"></script></body>')
    [IO.File]::WriteAllText($indexFile, $index)
    Invoke-BuildTool $aapt2 @('compile', '--dir', "$PSScriptRoot/res", '-o', "$work/res.zip")
    $linkArgs = @('link', '-I', $platform, '--manifest', "$PSScriptRoot/AndroidManifest.xml",
        '-o', "$work/linked.apk", "$work/res.zip")
    if ($BundleTool) { $linkArgs += '--proto-format' }
    Invoke-BuildTool $aapt2 $linkArgs

    $sources = @(Get-ChildItem -LiteralPath "$PSScriptRoot/src" -Recurse -Filter '*.java' | ForEach-Object FullName)
    Invoke-BuildTool $javac (@('--release', '8', '-encoding', 'UTF-8', '-cp', $platform, '-d', "$work/classes") + $sources)
    Invoke-BuildTool $jar @('cf', "$work/classes.jar", '-C', "$work/classes", '.')
    Invoke-BuildTool $java @('-cp', "$tools/lib/d8.jar", 'com.android.tools.r8.D8', '--release', '--min-api', '26',
        '--lib', $platform, '--output', "$work/dex", "$work/classes.jar")
    $key = Join-Path $signing 'procesador-de-texto.p12'
    $secret = Join-Path $signing 'password.txt'
    if (!(Test-Path -LiteralPath $key)) {
        $env:HC_APK_KEY_PASSWORD = [guid]::NewGuid().ToString('N')
        Set-Content -LiteralPath $secret -Value $env:HC_APK_KEY_PASSWORD -Encoding ascii
        Invoke-BuildTool $keytool @('-genkeypair', '-storetype', 'PKCS12', '-keystore', $key,
            '-alias', 'procesador-de-texto', '-storepass:env', 'HC_APK_KEY_PASSWORD', '-keyalg', 'RSA',
            '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Procesador de texto')
    } else {
        $env:HC_APK_KEY_PASSWORD = (Get-Content -LiteralPath $secret -Raw).Trim()
    }

    if ($BundleTool) {
        $module = Join-Path $work 'base'
        [IO.Compression.ZipFile]::ExtractToDirectory("$work/linked.apk", $module)
        New-Item -Path "$module/manifest" -ItemType Directory | Out-Null
        Move-Item -LiteralPath "$module/AndroidManifest.xml" -Destination "$module/manifest/"
        Move-Item -LiteralPath "$work/assets","$work/dex" -Destination $module
        Invoke-BuildTool $jar @('cMf', "$work/base.zip", '-C', $module, '.')
        $artifact = "$work/Procesador-de-texto.aab"
        Invoke-BuildTool $java @('-jar', $BundleTool, 'build-bundle', "--modules=$work/base.zip", "--output=$artifact")
        Invoke-BuildTool $jarsigner @('-keystore', $key, '-storetype', 'PKCS12',
            '-storepass:env', 'HC_APK_KEY_PASSWORD', $artifact, 'procesador-de-texto')
        Invoke-BuildTool $jarsigner @('-verify', $artifact)
        Invoke-BuildTool $java @('-jar', $BundleTool, 'validate', "--bundle=$artifact")
    } else {
        # jar normalizes asset entry paths to forward slashes on Windows.
        Invoke-BuildTool $jar @('uf', "$work/linked.apk", '-C', $work, 'assets', '-C', "$work/dex", 'classes.dex')
        Invoke-BuildTool "$tools/zipalign.exe" @('-p', '-f', '4', "$work/linked.apk", "$work/aligned.apk")
        $artifact = "$work/Procesador-de-texto.apk"
        Invoke-BuildTool $java @('-jar', "$tools/lib/apksigner.jar", 'sign', '--ks', $key,
            '--ks-key-alias', 'procesador-de-texto', '--ks-pass', 'env:HC_APK_KEY_PASSWORD',
            '--out', $artifact, "$work/aligned.apk")
        Invoke-BuildTool $java @('-jar', "$tools/lib/apksigner.jar", 'verify', '--verbose', $artifact)
    }
    Copy-Item -LiteralPath $artifact -Destination $dist -Force
    Write-Host "Archivo: $dist/$(Split-Path $artifact -Leaf)"
} finally {
    Remove-Item Env:HC_APK_KEY_PASSWORD -ErrorAction SilentlyContinue
    $resolvedWork = (Resolve-Path -LiteralPath $work).Path
    $resolvedRoot = (Resolve-Path -LiteralPath $buildRoot).Path
    if ($resolvedWork.StartsWith($resolvedRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedWork -Recurse -Force
    }
}

