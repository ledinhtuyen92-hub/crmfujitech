import os
import sys
import time
import subprocess
import json
from datetime import datetime, timedelta

def main():
    print("Starting Endurance Test...", flush=True)
    duration_hours = 4
    end_time = datetime.now() + timedelta(hours=duration_hours)
    
    # Track stats
    stats = {
        "start_time": datetime.now().isoformat(),
        "ffmpeg_restarts": 0,
        "is_completed": False
    }

    try:
        while datetime.now() < end_time:
            print(f"[{datetime.now().isoformat()}] Running...", flush=True)
            
            # Send a synthetic comment using curl or django shell
            os.system('docker-compose exec -T web python -c "import os, django; os.environ.setdefault(\'DJANGO_SETTINGS_MODULE\', \'core.settings\'); django.setup(); from live_sessions.models import LiveSession; from live_sessions.tasks import handle_live_message; sess = LiveSession.objects.first(); handle_live_message.delay(str(sess.id) if sess else \'test\', \\"Endurance test comment\\")"')
            
            time.sleep(30) # Wait 30s before next comment
            
            with open('docs/endurance_results.json', 'w') as f:
                json.dump(stats, f)
                
    except Exception as e:
        stats["error"] = str(e)
        print(f"Error: {e}")
        
    stats["end_time"] = datetime.now().isoformat()
    stats["is_completed"] = True
    
    with open('docs/endurance_results.json', 'w') as f:
        json.dump(stats, f)
        
    print("Endurance Test Completed.", flush=True)

if __name__ == "__main__":
    main()
