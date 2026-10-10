import os
import sys
import asyncio
import logging
import time
from typing import Optional, Tuple, List
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class StreamConfig:
    width: int = 720
    height: int = 1280
    fps: int = 30
    video_pixel_format: str = "rgb24"
    video_codec: str = "libx264"
    bitrate: str = "2500k"
    audio_sample_rate: int = 44100
    audio_channels: int = 2
    audio_format: str = "s16le"


class FfmpegLocator:
    def __init__(self, override_path: str = None):
        self.override_path = override_path
        
    async def locate(self) -> Optional[str]:
        candidates = []
        if self.override_path:
            candidates.append(self.override_path)
            
        import sys
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.dirname(os.path.dirname(__file__))
        bundled = os.path.join(base_dir, "bin", "ffmpeg.exe")
        candidates.append(bundled)
        candidates.append("ffmpeg")
        
        for candidate in candidates:
            try:
                proc = await asyncio.create_subprocess_exec(
                    candidate, "-version",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await proc.communicate()
                if proc.returncode == 0:
                    return candidate
            except FileNotFoundError:
                continue
            except Exception as e:
                logger.debug(f"Error checking ffmpeg candidate {candidate}: {e}")
                continue
                
        return None


class HardwareEncoderProbe:
    def __init__(self, ffmpeg_path: str):
        self.ffmpeg_path = ffmpeg_path
        
    async def probe(self) -> Tuple[str, List[str]]:
        """
        Probes for available hardware encoders.
        Returns: (preferred_encoder, [list of available encoders])
        """
        available = []
        try:
            proc = await asyncio.create_subprocess_exec(
                self.ffmpeg_path, "-encoders",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            if proc.returncode == 0:
                output = stdout.decode('utf-8', errors='ignore')
                for enc in ["h264_nvenc", "h264_qsv", "h264_amf", "libx264"]:
                    if f" {enc} " in output:
                        available.append(enc)
        except Exception as e:
            logger.error(f"Failed to probe encoders: {e}")
            
        if not available:
            available = ["libx264"]
            
        preferences = ["h264_nvenc", "h264_qsv", "h264_amf", "libx264"]
        preferred = "libx264"
        for pref in preferences:
            if pref in available:
                preferred = pref
                break
                
        return preferred, available


class LocalTcpTransport:
    """
    Provides a deterministic local transport for pushing raw video/audio to FFmpeg.
    Python acts as the TCP server, FFmpeg connects as the client.
    This avoids Windows Named Pipe limitations and deadlocks.
    """
    def __init__(self, host="127.0.0.1"):
        self.host = host
        self.port = 0
        self.server = None
        self.client_writer = None
        self.connected_event = asyncio.Event()
        self.close_event = asyncio.Event()

    async def start(self):
        self.server = await asyncio.start_server(self.handle_client, self.host, 0)
        self.port = self.server.sockets[0].getsockname()[1]
        
    async def handle_client(self, reader, writer):
        logger.debug(f"Client connected to port {self.port}!")
        self.client_writer = writer
        self.connected_event.set()
        await self.close_event.wait()
        
    async def write(self, data: bytes):
        if not self.client_writer:
            return
        try:
            self.client_writer.write(data)
            await self.client_writer.drain()
        except (ConnectionResetError, BrokenPipeError):
            pass
        
    async def close(self):
        self.close_event.set()
        if self.client_writer:
            try:
                self.client_writer.close()
                await self.client_writer.wait_closed()
            except (ConnectionResetError, BrokenPipeError, OSError):
                pass
        if self.server:
            self.server.close()
            await self.server.wait_closed()


class AVTimeline:
    """
    Shared media timeline for A/V synchronization.
    Video and Audio both calculate their PTS relative to the stream start.
    """
    def __init__(self, fps: int, sample_rate: int):
        self.start_time = time.monotonic()
        self.fps = fps
        self.sample_rate = sample_rate
        self.audio_samples_written = 0
        
    def get_video_pts(self, frame_index: int) -> float:
        return frame_index / self.fps
        
    def advance_audio(self, samples: int):
        self.audio_samples_written += samples
        
    def get_audio_pts(self) -> float:
        return self.audio_samples_written / self.sample_rate


class StreamEncoder:
    def __init__(self, config: StreamConfig, ffmpeg_path: str, output_url: str, cached_assets: dict = None):
        self.config = config
        self.ffmpeg_path = ffmpeg_path
        self.output_url = output_url
        self.cached_assets = cached_assets or {}
        self.video_transport = LocalTcpTransport()
        self.audio_transport = LocalTcpTransport()
        self.process = None
        self.timeline = AVTimeline(config.fps, config.audio_sample_rate)
        self.is_running = False
        
    async def start(self):
        await self.video_transport.start()
        await self.audio_transport.start()
        
        cmd = [
            self.ffmpeg_path,
            "-y",
            "-nostats",
            "-loglevel", "error"
        ]
        
        inputs = []
        # Input 0: Video
        if self.cached_assets.get('avatar'):
            inputs.extend(["-stream_loop", "-1", "-i", self.cached_assets['avatar']])
        else:
            inputs.extend([
                "-f", "rawvideo",
                "-pixel_format", self.config.video_pixel_format,
                "-video_size", f"{self.config.width}x{self.config.height}",
                "-framerate", str(self.config.fps),
                "-i", f"tcp://127.0.0.1:{self.video_transport.port}"
            ])
            
        # Input 1: Audio (TCP)
        inputs.extend([
            "-f", self.config.audio_format,
            "-ar", str(self.config.audio_sample_rate),
            "-ac", str(self.config.audio_channels),
            "-i", f"tcp://127.0.0.1:{self.audio_transport.port}"
        ])
        
        filter_complex = []
        video_out = "[0:v]"
        audio_out = "[1:a]"
        input_idx = 2
        
        # Background
        if self.cached_assets.get('background'):
            bg = self.cached_assets['background']
            if bg.endswith(('.mp4', '.webm')):
                inputs.extend(["-stream_loop", "-1", "-i", bg])
            else:
                inputs.extend(["-loop", "1", "-i", bg])
                
            # Chroma key avatar and put on background
            filter_complex.append(f"[0:v]colorkey=0x00FF00:0.1:0.1[ckout];[{input_idx}:v]scale={self.config.width}:{self.config.height}[bg];[bg][ckout]overlay=(W-w)/2:(H-h)/2[v1]")
            video_out = "[v1]"
            input_idx += 1
            
        # Overlay
        if self.cached_assets.get('overlay'):
            inputs.extend(["-loop", "1", "-i", self.cached_assets['overlay']])
            filter_complex.append(f"{video_out}[{input_idx}:v]scale={self.config.width}:{self.config.height}[ovl];{video_out}[ovl]overlay=0:0[v2]")
            video_out = "[v2]"
            input_idx += 1
            
        # BGM
        if self.cached_assets.get('audio'):
            inputs.extend(["-stream_loop", "-1", "-i", self.cached_assets['audio']])
            # volume=0.2 for bgm so it doesn't overpower TTS
            filter_complex.append(f"[{input_idx}:a]volume=0.2[bgm];{audio_out}[bgm]amix=inputs=2:duration=first[a1]")
            audio_out = "[a1]"
            input_idx += 1
            
        cmd.extend(inputs)
        
        if filter_complex:
            cmd.extend(["-filter_complex", ";".join(filter_complex)])
            cmd.extend(["-map", video_out, "-map", audio_out])
            
        # Output params
        cmd.extend([
            "-c:v", self.config.video_codec,
            "-b:v", self.config.bitrate,
            "-preset", "veryfast",
            "-pix_fmt", "yuv420p",
            "-g", "60",
            "-keyint_min", "60",
            "-c:a", "aac",
            "-b:a", "128k",
            "-f", "flv" if self.output_url.startswith("rtmp") else "null",
            self.output_url
        ])
        
        logger.info(f"FFmpeg command: {' '.join(cmd)}")
        flags = 0x08000000 if sys.platform == 'win32' else 0
        self.process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            creationflags=flags
        )
        self.is_running = True
        
        asyncio.create_task(self._monitor_process())

    async def _monitor_process(self):
        if not self.process:
            return
            
        try:
            while True:
                line = await self.process.stderr.readline()
                if not line:
                    break
                line_str = line.decode('utf-8', errors='ignore').strip()
                if "error" in line_str.lower():
                    logger.error(f"[FFmpeg] {line_str}")
                else:
                    logger.debug(f"[FFmpeg] {line_str}")
        except Exception as e:
            logger.error(f"FFmpeg monitor error: {e}")
            
        await self.process.wait()
        logger.info(f"FFmpeg process exited with code {self.process.returncode}")
        self.is_running = False
        await self.stop()

    async def write_video(self, frame_data: bytes):
        if self.is_running and self.video_transport.client_writer:
            try:
                await self.video_transport.write(frame_data)
            except Exception as e:
                logger.error(f"Video transport write failed (broken pipe?): {e}")
                await self.stop()
                
    async def write_audio(self, audio_data: bytes):
        if self.is_running and self.audio_transport.client_writer:
            try:
                await self.audio_transport.write(audio_data)
                bytes_per_sample = 2 * self.config.audio_channels
                samples = len(audio_data) // bytes_per_sample
                self.timeline.advance_audio(samples)
            except Exception as e:
                logger.error(f"Audio transport write failed (broken pipe?): {e}")
                await self.stop()

    async def stop(self):
        self.is_running = False
        if self.process and self.process.returncode is None:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()
                
        await self.video_transport.close()
        await self.audio_transport.close()
