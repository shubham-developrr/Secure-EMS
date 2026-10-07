import os
from dotenv import load_dotenv

# Force loading keys directly from root monorepo config
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

def save_file_to_cloud(file_path: str, data_bytes: bytes):
    """Saves a binary payload directly into the Cloud S3/Supabase Bucket, falling back to local storage if offline."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    
    success_cloud = False
    if url and key:
        try:
            from supabase import create_client
            supabase = create_client(url, key)
            # Overwrite if exists, mimicking local file behavior
            supabase.storage.from_("exam_papers").upload(
                file_path, 
                data_bytes, 
                file_options={"cache-control": "3600", "upsert": "true"}
            )
            print(f"Cloud Storage Driver: Successfully streamed {file_path} into bucket.")
            success_cloud = True
        except Exception as e:
            print(f"Cloud Storage Driver upload error: {e}. Attempting local fallback.")
    else:
        print("Cloud Storage Driver: SUPABASE_URL or SUPABASE_KEY missing. Falling back to local storage.")
        
    try:
        with open(file_path, "wb") as f:
            f.write(data_bytes)
        print(f"Cloud Storage Driver: Successfully saved {file_path} to local storage.")
        return True
    except Exception as e:
        print(f"Cloud Storage Driver local save error: {e}")
        return success_cloud

def load_file_from_cloud(file_path: str) -> bytes:
    """Downloads a binary payload securely from the Cloud S3 bucket into memory, falling back to local storage."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    
    if url and key:
        try:
            from supabase import create_client
            supabase = create_client(url, key)
            res = supabase.storage.from_("exam_papers").download(file_path)
            if res:
                return res
        except Exception as e:
            print(f"Cloud Storage Driver read error: {e}. Attempting local fallback.")
            
    # Fallback to local
    if os.path.exists(file_path):
        with open(file_path, "rb") as f:
            return f.read()
    else:
        return b""
