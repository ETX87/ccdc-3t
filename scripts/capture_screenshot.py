import subprocess
import time
import socket
import os
import sys

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dist_dir = os.path.join(root, "frontend", "dist")
    
    # 1. Build frontend
    print("Building frontend...")
    ret = subprocess.run(["npm", "--prefix", "frontend", "run", "build"], cwd=root, shell=True)
    if ret.returncode != 0:
        print("Frontend build failed!")
        sys.exit(1)

    # 2. Start Python HTTP Server
    port = find_free_port()
    print(f"Starting server on port {port} serving {dist_dir}...")
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--directory", dist_dir],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    time.sleep(1.5)
    
    try:
        edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
        out_img = os.path.join(root, "screenshot_actual.png")
        url = f"http://127.0.0.1:{port}/?demo=1"
        print(f"Capturing screenshot with Edge to {out_img}...")
        
        cmd = [
            edge_path,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--window-size=1672,941",
            f"--screenshot={out_img}",
            url
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        print("Edge exit code:", res.returncode)
        if os.path.exists(out_img):
            print(f"SUCCESS: Screenshot saved at {out_img}, size: {os.path.getsize(out_img)} bytes")
        else:
            print("ERROR: Screenshot file was not created!")
            print(res.stderr)
    finally:
        server_proc.terminate()
        server_proc.wait()

if __name__ == "__main__":
    main()
