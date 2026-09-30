import urllib.request
import zipfile
import os
import ssl
import sys

def hook(block_num, block_size, total_size):
    read_so_far = block_num * block_size
    if total_size > 0:
        percent = read_so_far * 100 / total_size
        s = f"\r{percent:.2f}% [{read_so_far} / {total_size}]"
        sys.stdout.write(s)
        if read_so_far >= total_size:
            sys.stdout.write("\n")
    else:
        sys.stdout.write(f"\rRead {read_so_far} bytes")
    sys.stdout.flush()

ssl._create_default_https_context = ssl._create_unverified_context

url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
zip_path = "ffmpeg.zip"
print("Downloading ffmpeg...", flush=True)
try:
    urllib.request.urlretrieve(url, zip_path, hook)
except Exception as e:
    print(f"Download error: {e}", flush=True)
    sys.exit(1)

print("\nExtracting...", flush=True)
try:
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall("ffmpeg_extract")
except Exception as e:
    print(f"Extract error: {e}", flush=True)
    sys.exit(1)

bin_dir = "live_studio/bin"
os.makedirs(bin_dir, exist_ok=True)

for root, dirs, files in os.walk("ffmpeg_extract"):
    for file in files:
        if file == "ffmpeg.exe" or file == "ffprobe.exe":
            target = os.path.join(bin_dir, file)
            if os.path.exists(target):
                os.remove(target)
            os.rename(os.path.join(root, file), target)
            print(f"Found and moved {file}", flush=True)
            
print("Cleaning up...", flush=True)
import shutil
shutil.rmtree("ffmpeg_extract", ignore_errors=True)
os.remove(zip_path)
print("Done.", flush=True)
