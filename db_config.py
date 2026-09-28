import os
import sys

def get_app_data_dir():
    # If APPDATA is present (Windows), use it. Otherwise use user home directory.
    if sys.platform == "win32":
        base_dir = os.environ.get("APPDATA", os.path.expanduser("~"))
    elif sys.platform == "darwin":
        base_dir = os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    else:
        base_dir = os.path.join(os.path.expanduser("~"), ".local", "share")
    
    app_dir = os.path.join(base_dir, "SecureEMS")
    
    # Ensure the directory exists
    if not os.path.exists(app_dir):
        os.makedirs(app_dir, exist_ok=True)
        
    return app_dir

def get_db_path(db_filename):
    return os.path.join(get_app_data_dir(), db_filename)
