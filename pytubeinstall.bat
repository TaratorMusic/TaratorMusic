@echo off

python --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Python is not installed. Installing Python...
    curl -o python-installer.exe https://www.python.org/ftp/python/3.11.5/python-3.11.5-amd64.exe
    python-installer.exe /quiet InstallAllUsers=1 PrependPath=1
    del python-installer.exe
) ELSE (
    echo Python is already installed.
)

python --version

echo Installing PIP...
curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py
python get-pip.py
pip --version
del get-pip.py

echo Installing Requests and Pytube...
pip install requests
pip install pytubefix

echo Installation complete.
pause
