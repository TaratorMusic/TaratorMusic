# setup.py
# Converts pytube.py to executable files that don't require python.
from cx_Freeze import setup, Executable

setup(
    name="Pytube",
    version="1.0",
    description="My one-time run script",
    executables=[Executable("pytube.py", base=None)],
)
