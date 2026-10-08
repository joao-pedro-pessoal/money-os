@echo off
setlocal
cd /d "%~dp0.."
if not defined JAVA_HOME set "JAVA_HOME=C:\Users\joao2\AppData\Local\Programs\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%PATH%"
call gradlew.bat assembleHomeDebug assembleStoreDebug --offline
if errorlevel 1 exit /b 1
set "ANDROID_JAR=%ANDROID_HOME%\platforms\android-36\android.jar"
for %%V in (home store) do (
  call :check %%V
  if errorlevel 1 exit /b 1
)
exit /b 0

:check
set "APP_CLASSES=app\build\intermediates\javac\%1Debug\compile%1DebugJavaWithJavac\classes"
rem Gradle's task name begins with an upper-case flavor.
if "%1"=="home" set "APP_CLASSES=app\build\intermediates\javac\homeDebug\compileHomeDebugJavaWithJavac\classes"
if "%1"=="store" set "APP_CLASSES=app\build\intermediates\javac\storeDebug\compileStoreDebugJavaWithJavac\classes"
"%JAVA_HOME%\bin\javac.exe" -cp "%ANDROID_JAR%;%APP_CLASSES%" -d build\cache-tests tests\WidgetCacheTest.java
if errorlevel 1 exit /b 1
"%JAVA_HOME%\bin\java.exe" -cp "build\cache-tests;%APP_CLASSES%;%ANDROID_JAR%" com.joaonovais.moneyos.shell.WidgetCacheTest
exit /b %ERRORLEVEL%
