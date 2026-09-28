import datetime

# Device Runtime States
STATE_DISCONNECTED = "disconnected"
STATE_CONNECTING = "connecting"
STATE_CONNECTED = "connected"
STATE_SYNCHRONIZED = "synchronized"
STATE_PAUSED = "paused"
STATE_RUNNING = "running"
STATE_STOPPED = "stopped"
STATE_ERROR = "error"

# Speech Lifecycle States
SPEECH_QUEUED = "queued"
SPEECH_DOWNLOADING = "downloading"
SPEECH_READY = "ready"
SPEECH_PLAYING = "playing"
SPEECH_COMPLETED = "completed"
SPEECH_FAILED = "failed"
SPEECH_INTERRUPTED = "interrupted"

# ACK Status
ACK_RECEIVED = "received"
ACK_COMPLETED = "completed"
ACK_FAILED = "failed"
ACK_INTERRUPTED = "interrupted"

# Priorities
PRIORITY_HIGH = "high"
PRIORITY_NORMAL = "normal"
