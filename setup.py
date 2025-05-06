# setup.py
# Converts pytube.py to executable files that don't require python.
from cx_Freeze import setup, Executable

build_options = {
    'packages': ['pytubefix', 'pytube', 'requests', 'json', 'os', 'ssl', 'base64'],
    'excludes': [],
}

setup(
    name="Pytube",
    version="1.0",
    description="My one-time run script",
    options={"build_exe": build_options},
    executables=[Executable("pytube.py", base=None)],
)