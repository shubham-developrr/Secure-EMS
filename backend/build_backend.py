import os
import subprocess
import sys

def build_executable():
    print("Building Python Backend with PyInstaller...")
    # Add data files or dependencies if needed.
    # PyInstaller might need to know about cryptography or other hidden imports.
    command = [
        "pyinstaller",
        "--noconfirm",
        "--onefile",
        "--windowed", # Run without opening a terminal window
        "--add-data", "db_config.py;.", # Include the db config
        "--hidden-import", "cryptography",
        "--hidden-import", "fastapi",
        "--hidden-import", "uvicorn",
        "--hidden-import", "pydantic",
        "--distpath", "dist-backend",
        "--workpath", "build",
        "server.py"
    ]
    
    subprocess.run(command, check=True)
    print("Backend build complete.")

if __name__ == "__main__":
    build_executable()
